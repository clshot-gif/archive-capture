import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import TagChip from '../components/TagChip';
import * as StorageService from '../services/StorageService';

export default function TagVocabularyScreen({ route, navigation }) {
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const [tags, setTags] = useState(route.params?.tags ?? []);
  const [newTagValue, setNewTagValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    if (!route.params?.tags) {
      StorageService.loadTags().then(setTags);
    }
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
      Alert.alert('No tags', 'Add at least one tag before continuing.');
      return;
    }
    await StorageService.saveTags(tags);
    if (fromOnboarding) {
      navigation.replace('Scanner');
    } else {
      navigation.goBack();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {fromOnboarding ? 'Review Your Tags' : 'Edit Tags'}
      </Text>
      {fromOnboarding && (
        <Text style={styles.subtitle}>
          These tags were generated for your project. Tap any chip to rename it, tap ✕ to delete, + to add.
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

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>
          {fromOnboarding ? 'Start Scanning →' : 'Save'}
        </Text>
      </TouchableOpacity>
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
  saveBtn: {
    backgroundColor: '#1565C0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    margin: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
