import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal,
} from 'react-native';
import TagChip from '../components/TagChip';
import * as StorageService from '../services/StorageService';

export default function TagVocabularyScreen({ route, navigation }) {
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const [tags, setTags] = useState([]);
  const [newTagValue, setNewTagValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(null);

  const [previousTagsVisible, setPreviousTagsVisible] = useState(false);
  const [allTagsEver, setAllTagsEver] = useState([]);
  const [selectedPreviousTags, setSelectedPreviousTags] = useState([]);

  useEffect(() => {
    StorageService.getActiveProject().then((project) => {
      setActiveProjectId(project?.id ?? null);
      StorageService.loadTagsForProject(project?.id).then(setTags);
    });
  }, []);

  function deleteTag(index) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  function renameTag(index, newLabel) {
    setTags((prev) => prev.map((t, i) => (i === index ? newLabel : t)));
  }

  function addTag() {
    if (!newTagValue.trim()) return;
    setTags((prev) => [...prev, newTagValue.trim()]);
    setNewTagValue('');
    setAddingNew(false);
  }

  async function handleSave() {
    if (tags.length === 0) {
      Alert.alert('No tags', 'Add at least one tag, or tap "Skip for now" below.');
      return;
    }
    await StorageService.saveTagsForProject(activeProjectId, tags);
    if (fromOnboarding) {
      navigation.replace('Scanner');
    } else {
      navigation.goBack();
    }
  }

  function handleSkip() {
    navigation.replace('Scanner');
  }

  // ─── Previous Tags picker ───────────────────────────────────────────────────

  async function openPreviousTags() {
    const all = await StorageService.loadAllTagsEver();
    setAllTagsEver(all);
    setSelectedPreviousTags([]);
    setPreviousTagsVisible(true);
  }

  function togglePreviousTag(tag) {
    setSelectedPreviousTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function removeFromEverPool(tag) {
    await StorageService.deleteFromAllTagsEver(tag);
    setAllTagsEver((prev) => prev.filter((t) => t !== tag));
    setSelectedPreviousTags((prev) => prev.filter((t) => t !== tag));
  }

  function addSelectedPreviousTags() {
    setTags((prev) => {
      const merged = [...prev];
      selectedPreviousTags.forEach((t) => {
        if (!merged.includes(t)) merged.push(t);
      });
      return merged;
    });
    setPreviousTagsVisible(false);
  }

  const availablePreviousTags = allTagsEver.filter((t) => !tags.includes(t));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {fromOnboarding ? 'Create Tags' : 'Edit Tags'}
      </Text>
      {fromOnboarding && (
        <Text style={styles.subtitle}>
          Tags help you sort documents while you scan. This is entirely optional — you can skip it and add tags later, or add them as you go.
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.chipArea}>
        {tags.map((tag, i) => (
          <TagChip
            key={`${tag}-${i}`}
            label={tag}
            onDelete={() => deleteTag(i)}
            onRename={(val) => renameTag(i, val)}
          />
        ))}

        {addingNew ? (
          <View style={styles.newTagRow}>
            <TextInput
              style={styles.newTagInput}
              value={newTagValue}
              onChangeText={setNewTagValue}
              placeholder="New tag…"
              placeholderTextColor="#5B8DBB"
              onSubmitEditing={addTag}
              autoFocus
            />
            <TouchableOpacity onPress={addTag} style={styles.addConfirmBtn}>
              <Text style={styles.addConfirmText}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setAddingNew(true)}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+ Add Tag</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.previousTagsBtn} onPress={openPreviousTags}>
        <Text style={styles.previousTagsBtnText}>Previous Tags</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>
          {fromOnboarding ? 'Start Scanning →' : 'Save'}
        </Text>
      </TouchableOpacity>

      {fromOnboarding && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      )}

      {/* Previous Tags modal */}
      <Modal visible={previousTagsVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Previous Tags</Text>
            <Text style={styles.modalSubtitle}>
              Tags you've used in any project. Select the ones to add here.
            </Text>
            <ScrollView style={styles.modalList}>
              {availablePreviousTags.length === 0 ? (
                <Text style={styles.modalEmptyText}>No previous tags yet.</Text>
              ) : (
                availablePreviousTags.map((tag) => {
                  const selected = selectedPreviousTags.includes(tag);
                  return (
                    <View key={tag} style={styles.previousTagRow}>
                      <TouchableOpacity
                        style={styles.previousTagCheckArea}
                        onPress={() => togglePreviousTag(tag)}
                      >
                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                          {selected && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.previousTagLabel}>{tag}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => removeFromEverPool(tag)}
                        style={styles.previousTagDeleteBtn}
                      >
                        <Text style={styles.previousTagDeleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPreviousTagsVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAddBtn, selectedPreviousTags.length === 0 && styles.disabledBtn]}
                onPress={addSelectedPreviousTags}
                disabled={selectedPreviousTags.length === 0}
              >
                <Text style={styles.modalAddText}>
                  Add {selectedPreviousTags.length > 0 ? `(${selectedPreviousTags.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A237E',
    marginTop: 8,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  chipArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 24,
  },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 4,
  },
  newTagInput: {
    borderWidth: 1,
    borderColor: '#90CAF9',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    fontSize: 14,
    minWidth: 120,
    color: '#222',
    backgroundColor: '#E3F2FD',
  },
  addConfirmBtn: {
    marginLeft: 8,
    backgroundColor: '#1565C0',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  addConfirmText: { color: '#fff', fontWeight: '600' },
  addBtn: {
    borderWidth: 1.5,
    borderColor: '#90CAF9',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    margin: 4,
    borderStyle: 'dashed',
  },
  addBtnText: { color: '#1565C0', fontSize: 14 },
  previousTagsBtn: {
    borderWidth: 1.5,
    borderColor: '#1565C0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  previousTagsBtnText: { color: '#1565C0', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#1565C0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    margin: 8,
    marginTop: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  skipBtnText: { color: '#888', fontSize: 14, textDecorationLine: 'underline' },
  // Previous Tags modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '75%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  modalSubtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 12 },
  modalList: { marginBottom: 12 },
  modalEmptyText: { fontSize: 14, color: '#888', paddingVertical: 16, textAlign: 'center' },
  previousTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  previousTagCheckArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  previousTagLabel: { fontSize: 15, color: '#333' },
  previousTagDeleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  previousTagDeleteText: { fontSize: 14, color: '#c0392b', fontWeight: '700' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  modalCancelText: { fontSize: 14, color: '#555' },
  modalAddBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    backgroundColor: '#1565C0',
  },
  modalAddText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  disabledBtn: { opacity: 0.5 },
});
