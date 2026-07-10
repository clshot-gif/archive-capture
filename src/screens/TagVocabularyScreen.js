import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import TagChip from '../components/TagChip';
import PreviousTagsModal from '../components/PreviousTagsModal';
import * as StorageService from '../services/StorageService';
import useTagAutocomplete from '../hooks/useTagAutocomplete';

export default function TagVocabularyScreen({ route, navigation }) {
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const [tags, setTags] = useState([]);
  const [newTagValue, setNewTagValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [previousTagsVisible, setPreviousTagsVisible] = useState(false);
  const tagSuggestions = useTagAutocomplete(newTagValue, tags);

  useEffect(() => {
    StorageService.getActiveProject().then((project) => {
      setActiveProjectId(project?.id ?? null);
      StorageService.loadTagsForProject(project?.id).then(setTags);
    });
  }, []);

  function deleteTag(index) {
    const tag = tags[index];
    Alert.alert('Delete tag?', `Remove "${tag}" from this collection's tags.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setTags((prev) => prev.filter((_, i) => i !== index)),
      },
    ]);
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

  function addPreviousTags(selectedTags) {
    setTags((prev) => {
      const merged = [...prev];
      selectedTags.forEach((t) => {
        if (!merged.includes(t)) merged.push(t);
      });
      return merged;
    });
  }

  // Tapping an autocomplete suggestion adds it straight away — no need to
  // finish typing it out or go find it in Previous Tags.
  function selectSuggestion(tag) {
    addPreviousTags([tag]);
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
          <View style={styles.newTagWrap}>
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
          <TouchableOpacity
            onPress={() => setAddingNew(true)}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+ Add Tag</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.previousTagsBtn} onPress={() => setPreviousTagsVisible(true)}>
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
  newTagWrap: { margin: 4 },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
});
