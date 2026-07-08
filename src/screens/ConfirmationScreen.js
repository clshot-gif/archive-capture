import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as StorageService from '../services/StorageService';
import PreviousTagsModal from '../components/PreviousTagsModal';
import useTagAutocomplete from '../hooks/useTagAutocomplete';
import { CONTROL_ROW_BOTTOM, CONTROL_ROW_HEIGHT } from '../constants/layout';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strip characters that are invalid in file/folder names if this Drive
// content is ever mirrored onto a real filesystem (Windows, phase 2 tooling).
function sanitizeForFilename(str) {
  return String(str).trim().replace(/[\\/:*?"<>|]/g, '');
}

// Confirmed real incident (2026-07-08): a long Collection name pushed the
// combined filename long enough that Drive's file upload silently and
// permanently failed (the file saves locally and queues fine — no visible
// error — it only fails once the queue tries to actually upload it, so it
// looked exactly like a network/sync problem instead of a naming one).
// Truncating just the Drive `properties` copy of the filename wasn't
// enough, since the *actual* filename — used for the local file path and
// as Drive's own `name` field, not just the properties copy — was still
// long. Cap it at the source so every use of it is already safe.
const MAX_FILENAME_LENGTH = 100;

function buildFileBaseName(archiveName, collectionName, box, folder, counter) {
  const parts = [];
  if (archiveName) parts.push(sanitizeForFilename(archiveName));
  if (collectionName) parts.push(sanitizeForFilename(collectionName));
  if (box) parts.push(sanitizeForFilename(box));
  if (folder) parts.push(sanitizeForFilename(folder));
  parts.push(StorageService.formatCounter(counter));
  const joined = parts.join(' - ');
  return joined.length > MAX_FILENAME_LENGTH ? joined.slice(0, MAX_FILENAME_LENGTH) : joined;
}

// expo-print renders each `.page` div against a real fixed PDF page size, not
// the phone's screen — a page shaped like typical print paper (~0.77 wide
// per unit tall) is a lot squatter than a portrait phone photo (~0.5 wide per
// unit tall). Fitting a much-taller-than-the-page image into that box via
// vh/percentage-height CSS was landing on a webview flexbox edge case that
// collapsed to the image's natural size and let `overflow:hidden` clip most
// of it away. Sizing the PDF page itself to match the photo's aspect ratio
// avoids that fitting problem entirely — width:100%/height:auto is all that's
// needed once the page is already the right shape.
const PAGE_WIDTH_PT = 612; // 8.5in at 72pt/in — arbitrary but print-reasonable
const FALLBACK_ASPECT = 0.5; // used only if a page is missing image dimensions
const BANNER_ALLOWANCE_PT = 50;
const COMMENT_ALLOWANCE_PT = 100;

function computePageSize(pages) {
  const withDims = pages.find((p) => p.imageWidth && p.imageHeight);
  const aspect = withDims ? withDims.imageWidth / withDims.imageHeight : FALLBACK_ASPECT;
  let height = Math.round(PAGE_WIDTH_PT / aspect);
  if (pages.some((p) => p.hasMarkup)) height += BANNER_ALLOWANCE_PT;
  if (pages.some((p) => p.typedComment)) height += COMMENT_ALLOWANCE_PT;
  return { width: PAGE_WIDTH_PT, height };
}

export default function ConfirmationScreen({ route, navigation }) {
  const { pages, box, folder } = route.params;

  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTagText, setNewTagText] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [previousTagsVisible, setPreviousTagsVisible] = useState(false);

  const isOMG = pages.some((p) => p.omg);
  const tagSuggestions = useTagAutocomplete(newTagText, tags);

  useEffect(() => {
    StorageService.getActiveProject().then((project) => {
      setActiveProjectId(project?.id ?? null);
      StorageService.loadTagsForProject(project?.id).then(setTags);
    });
  }, []);

  function toggleTag(tag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function deleteProjectTag(tag) {
    Alert.alert('Delete tag?', `Remove "${tag}" from this collection's tags.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = tags.filter((t) => t !== tag);
          setTags(updated);
          setSelectedTags((prev) => prev.filter((t) => t !== tag));
          await StorageService.saveTagsForProject(activeProjectId, updated);
        },
      },
    ]);
  }

  async function addPreviousTags(selectedPreviousTags) {
    const merged = [...tags];
    selectedPreviousTags.forEach((t) => {
      if (!merged.includes(t)) merged.push(t);
    });
    setTags(merged);
    setSelectedTags((prev) => {
      const mergedSelected = [...prev];
      selectedPreviousTags.forEach((t) => {
        if (!mergedSelected.includes(t)) mergedSelected.push(t);
      });
      return mergedSelected;
    });
    await StorageService.saveTagsForProject(activeProjectId, merged);
  }

  async function addNewTag() {
    const trimmed = newTagText.trim();
    if (!trimmed) return;
    const updated = [...tags, trimmed];
    setTags(updated);
    setSelectedTags((prev) => [...prev, trimmed]);
    await StorageService.saveTagsForProject(activeProjectId, updated);
    setNewTagText('');
    setAddingNew(false);
  }

  // Tapping an autocomplete suggestion adds it straight away — no need to
  // finish typing it out or go find it in Previous Tags.
  async function selectSuggestion(tag) {
    await addPreviousTags([tag]);
    setNewTagText('');
    setAddingNew(false);
  }

  async function buildPDF() {
    const backupPages = pages.reduce((acc, p, i) => (p.hasMarkup ? [...acc, i] : acc), []);

    const pageHtmlParts = pages.map((page, idx) => {
      const commentHtml = page.typedComment
        ? `<div class="comment">${escapeHtml(page.typedComment)}</div>`
        : '';
      const bannerHtml = page.hasMarkup
        ? `<div class="markup-banner">✏️ Marked up — unmarked original on page ${pages.length + 1 + 1 + backupPages.indexOf(idx)}</div>`
        : '';
      return `<div class="page">
  ${bannerHtml}
  <div class="img-wrap">
    <img src="data:image/jpeg;base64,${page.base64Image}" />
    <svg viewBox="${page.svgViewBox}" xmlns="http://www.w3.org/2000/svg">
      ${page.svgMarkup}
    </svg>
  </div>
  ${commentHtml}
</div>`;
    });

    // Build per-page blocks (only for pages that have at least one value)
    const pageBlocks = pages.map((p, i) => {
      const lines = [];
      if (p.typedComment) lines.push(`<div class="notes-line"><span class="notes-label">Comments:</span> ${escapeHtml(p.typedComment)}</div>`);
      if (p.omg) lines.push(`<div class="notes-line notes-omg">OMG</div>`);
      if (lines.length === 0) return null;
      return `<div class="notes-block">
  <div class="notes-page-heading">Page ${i + 1}</div>
  ${lines.join('\n  ')}
</div>`;
    }).filter(Boolean);

    // Document-level footer: tags, box, folder
    const footerLines = [];
    if (selectedTags.length > 0) footerLines.push(`<div class="notes-line"><span class="notes-label">Tags:</span> ${selectedTags.map(escapeHtml).join(', ')}</div>`);
    if (box) footerLines.push(`<div class="notes-line"><span class="notes-label">Box:</span> ${escapeHtml(String(box))}</div>`);
    if (folder) footerLines.push(`<div class="notes-line"><span class="notes-label">Folder:</span> ${escapeHtml(String(folder))}</div>`);

    const notesBodyHtml = [
      ...pageBlocks,
      footerLines.length > 0 ? `<div class="notes-footer">${footerLines.join('\n')}</div>` : '',
    ].join('\n');

    pageHtmlParts.push(
      `<div class="notes-page">${notesBodyHtml}</div>`
    );

    backupPages.forEach((idx) => {
      const page = pages[idx];
      pageHtmlParts.push(
        `<div class="page"><div class="img-wrap"><img src="data:image/jpeg;base64,${page.base64Image}" /></div></div>`
      );
    });

    const html = `<!DOCTYPE html>
<html><head><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:100%; }
  .page { position:relative; width:100%; page-break-after:always; }
  .img-wrap { position:relative; width:100%; }
  img { width:100%; height:auto; display:block; }
  svg { position:absolute; top:0; left:0; width:100%; height:100%; }
  .markup-banner { font-size:24px; font-weight:bold; text-align:center; padding:12px; background:#fff3e0; border-bottom:4px solid #e65100; color:#bf360c; }
  .comment { font-size:14px; padding:8px 12px; background:#fffde7; border-top:2px solid #f9a825; }
  .notes-page { padding: 24px; }
  .notes-block { margin-bottom: 20px; }
  .notes-page-heading { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 6px; }
  .notes-line { font-size: 15px; color: #222; margin-bottom: 4px; }
  .notes-label { font-weight: bold; }
  .notes-omg { font-weight: bold; color: #c0392b; }
  .notes-footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd; }
</style></head>
<body>${pageHtmlParts.join('\n')}</body></html>`;

    return html;
  }

  async function handleDone() {
    setSaving(true);
    try {
      const project = await StorageService.getActiveProject();
      const scopeKey = `${project?.id || 'noproject'}::${box || ''}::${folder || ''}`;
      const counter = await StorageService.getNextCounterForScope(scopeKey);
      const baseName = buildFileBaseName(project?.archiveName, project?.name, box, folder, counter);
      const filename = isOMG ? `${baseName} - OMG.pdf` : `${baseName}.pdf`;

      const html = await buildPDF();
      const { width: pageWidth, height: pageHeight } = computePageSize(pages);
      const { uri: pdfUri } = await Print.printToFileAsync({ html, width: pageWidth, height: pageHeight });

      const localDir = FileSystem.documentDirectory + 'pending/';
      await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
      const localPath = localDir + filename;
      await FileSystem.copyAsync({ from: pdfUri, to: localPath });

      const omgPages = pages.reduce((acc, p, i) => (p.omg ? [...acc, i] : acc), []);
      const backupPages = pages.reduce((acc, p, i) => (p.hasMarkup ? [...acc, i] : acc), []);
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
        collection: project?.name || '',
        archive_name: project?.archiveName || '',
        captured_at: new Date().toISOString(),
        temp_filename: filename,
        page_count: String(pages.length),
        omg_pages: JSON.stringify(omgPages),
        unmarked_backup_pages: JSON.stringify(backupPages),
        typed_comments: JSON.stringify(typedComments),
      };

      const folderId = project?.driveFolderId;

      // Always queue — ScannerScreen's loadState() → processQueue() handles upload in background
      await StorageService.addToQueue({ localPath, filename, folderId, metadata });

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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tagArea}>
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <View key={tag} style={styles.tagRow}>
              <TouchableOpacity style={styles.tagRowMain} onPress={() => toggleTag(tag)}>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.tagLabel, selected && styles.tagLabelSelected]}>
                  {tag}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteProjectTag(tag)} style={styles.tagDeleteBtn}>
                <Text style={styles.tagDeleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {addingNew ? (
          <View style={styles.newTagWrap}>
            <View style={styles.newTagRow}>
              <TextInput
                style={styles.newTagInput}
                value={newTagText}
                onChangeText={setNewTagText}
                placeholder="New tag…"
                placeholderTextColor="#999"
                onSubmitEditing={addNewTag}
                autoFocus
              />
              <TouchableOpacity onPress={addNewTag} style={styles.addConfirmBtn}>
                <Text style={styles.addConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
            {tagSuggestions.length > 0 && (
              <View style={styles.suggestionRow}>
                {tagSuggestions.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.suggestionChip}
                    onPress={() => selectSuggestion(tag)}
                  >
                    <Text style={styles.suggestionText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.addTagBtn} onPress={() => setAddingNew(true)}>
            <Text style={styles.addTagText}>+ Add new tag</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.previousTagsBtn} onPress={() => setPreviousTagsVisible(true)}>
        <Text style={styles.previousTagsBtnText}>Previous Tags</Text>
      </TouchableOpacity>

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

      <PreviousTagsModal
        visible={previousTagsVisible}
        existingTags={tags}
        onClose={() => setPreviousTagsVisible(false)}
        onAdd={addPreviousTags}
      />
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
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tagRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tagDeleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  tagDeleteText: { fontSize: 14, color: '#c0392b', fontWeight: '700' },
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
  newTagWrap: { paddingVertical: 8 },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newTagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: '#222',
  },
  addConfirmBtn: {
    marginLeft: 8,
    backgroundColor: '#1565C0',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addConfirmText: { color: '#fff', fontWeight: '600' },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: '#90CAF9',
    backgroundColor: '#E3F2FD',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  suggestionText: { color: '#1565C0', fontSize: 13, fontWeight: '600' },
  addTagBtn: {
    paddingVertical: 12,
  },
  addTagText: { color: '#1565C0', fontSize: 14 },
  previousTagsBtn: {
    borderWidth: 1.5,
    borderColor: '#1565C0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    // Clears the floating Done button below (same distance as its own
    // height + CONTROL_ROW_BOTTOM, see src/constants/layout.js).
    marginBottom: CONTROL_ROW_BOTTOM + CONTROL_ROW_HEIGHT,
  },
  previousTagsBtnText: { color: '#1565C0', fontSize: 15, fontWeight: '600' },
  // Pinned to the same distance from the bottom edge as Scanner's shutter
  // and Markup's action row so all three line up (see src/constants/layout.js).
  doneBtn: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: CONTROL_ROW_BOTTOM,
    height: CONTROL_ROW_HEIGHT,
    backgroundColor: '#1565C0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
