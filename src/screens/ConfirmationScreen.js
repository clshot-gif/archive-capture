import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as StorageService from '../services/StorageService';
import * as DriveService from '../services/DriveService';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function ConfirmationScreen({ route, navigation }) {
  const { pages, box, folder } = route.params;

  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTagText, setNewTagText] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const isOMG = pages.some((p) => p.omg);

  useEffect(() => {
    StorageService.loadTags().then(setTags);
  }, []);

  function toggleTag(tag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function addNewTag() {
    const trimmed = newTagText.trim();
    if (!trimmed) return;
    const updated = [...tags, trimmed];
    setTags(updated);
    setSelectedTags((prev) => [...prev, trimmed]);
    await StorageService.saveTags(updated);
    setNewTagText('');
    setAddingNew(false);
  }

  async function buildPDF() {
    const pageHtmlParts = pages.map((page, idx) => {
      const isLast = idx === pages.length - 1;
      const pageBreakStyle = isLast ? '' : 'page-break-after: always;';
      const commentHtml = page.typedComment
        ? `<div class="comment">${escapeHtml(page.typedComment)}</div>`
        : '';
      return `<div class="page" style="${pageBreakStyle}">
  <div class="img-wrap">
    <img src="data:image/jpeg;base64,${page.base64Image}" />
    <svg viewBox="${page.svgViewBox}" xmlns="http://www.w3.org/2000/svg">
      ${page.svgMarkup}
    </svg>
  </div>
  ${commentHtml}
</div>`;
    });

    const html = `<!DOCTYPE html>
<html><head><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:210mm; }
  .page { position:relative; width:100%; }
  .img-wrap { position:relative; width:100%; }
  img { width:100%; display:block; }
  svg { position:absolute; top:0; left:0; width:100%; height:100%; }
  .comment { font-size:14px; padding:8px 12px; background:#fffde7; border-top:2px solid #f9a825; }
</style></head>
<body>${pageHtmlParts.join('\n')}</body></html>`;

    return html;
  }

  async function handleDone() {
    setSaving(true);
    try {
      const project = await StorageService.loadProject();
      const counter = await StorageService.getNextCounter();
      const baseName = StorageService.formatCounter(counter);
      const filename = isOMG ? `${baseName} OMG.pdf` : `${baseName}.pdf`;

      const html = await buildPDF();
      const { uri: pdfUri } = await Print.printToFileAsync({ html });

      const localDir = FileSystem.documentDirectory + 'pending/';
      await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
      const localPath = localDir + filename;
      await FileSystem.copyAsync({ from: pdfUri, to: localPath });

      const omgPages = pages.reduce((acc, p, i) => (p.omg ? [...acc, i] : acc), []);
      const typedComments = pages
        .map((p, i) => (p.typedComment ? { page: i, text: p.typedComment } : null))
        .filter(Boolean);

      const metadata = {
        box: box || '',
        folder: folder || '',
        tags: selectedTags,
        important: isOMG ? 'true' : 'false',
        is_comment: 'false',
        parent_id: '',
        has_markup: pages.some((p) => p.hasMarkup) ? 'true' : 'false',
        collection: project?.collectionName || '',
        captured_at: new Date().toISOString(),
        temp_filename: filename,
        page_count: String(pages.length),
        omg_pages: JSON.stringify(omgPages),
        typed_comments: JSON.stringify(typedComments),
      };

      const folderId = project?.driveFolderId;
      let queued = false;

      try {
        await DriveService.uploadPDF({ localPath, filename, folderId, metadata });
      } catch (_) {
        await StorageService.addToQueue({ localPath, filename, folderId, metadata });
        queued = true;
      }

      if (queued) {
        Alert.alert('Saved locally', "No internet connection. Document will sync to Google Drive when you're back online.", [{ text: 'OK' }]);
      }

      navigation.navigate('Scanner', { pages: [] });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.filename}>
          {pages.length} page{pages.length !== 1 ? 's' : ''}{isOMG ? ' · OMG' : ''}
        </Text>
        <Text style={styles.location}>
          Box: {box || '—'}  ·  Folder: {folder || '—'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Tags</Text>
      <ScrollView contentContainerStyle={styles.tagArea}>
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <TouchableOpacity
              key={tag}
              style={styles.tagRow}
              onPress={() => toggleTag(tag)}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.tagLabel, selected && styles.tagLabelSelected]}>
                {tag}
              </Text>
            </TouchableOpacity>
          );
        })}

        {addingNew ? (
          <View style={styles.newTagRow}>
            <TextInput
              style={styles.newTagInput}
              value={newTagText}
              onChangeText={setNewTagText}
              placeholder="New tag…"
              onSubmitEditing={addNewTag}
              autoFocus
            />
            <TouchableOpacity onPress={addNewTag} style={styles.addConfirmBtn}>
              <Text style={styles.addConfirmText}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addTagBtn} onPress={() => setAddingNew(true)}>
            <Text style={styles.addTagText}>+ Add new tag</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.doneBtn, saving && styles.disabledBtn]}
        onPress={handleDone}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.doneBtnText}>Done →</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: '#E8EAF6',
    padding: 20,
    paddingTop: 60,
  },
  filename: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A237E',
  },
  location: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  tagArea: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#bbb',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: '#1565C0',
    backgroundColor: '#1565C0',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  tagLabel: { fontSize: 15, color: '#333' },
  tagLabelSelected: { color: '#1565C0', fontWeight: '600' },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  newTagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  addConfirmBtn: {
    marginLeft: 8,
    backgroundColor: '#1565C0',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addConfirmText: { color: '#fff', fontWeight: '600' },
  addTagBtn: {
    paddingVertical: 12,
  },
  addTagText: { color: '#1565C0', fontSize: 14 },
  doneBtn: {
    backgroundColor: '#1565C0',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
