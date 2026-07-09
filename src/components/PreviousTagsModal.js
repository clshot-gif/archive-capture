import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert,
} from 'react-native';
import * as StorageService from '../services/StorageService';

// Lets the user pull tags from the cross-project "ever used" pool into
// whatever tag list they're currently working with (a project's vocabulary,
// or a single document's tag checklist). The X next to each row prunes that
// tag from the pool entirely — separate from removing a tag off the current
// list, which the caller's own UI handles.
export default function PreviousTagsModal({ visible, existingTags, onClose, onAdd }) {
  const [allTagsEver, setAllTagsEver] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (visible) {
      StorageService.loadAllTagsEver().then(setAllTagsEver);
      setSelected([]);
    }
  }, [visible]);

  function toggle(tag) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function removeFromPool(tag) {
    Alert.alert(
      'Delete tag?',
      `Remove "${tag}" from the all-time tag list. This doesn't remove it from any collection it's already on.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteFromAllTagsEver(tag);
            setAllTagsEver((prev) => prev.filter((t) => t !== tag));
            setSelected((prev) => prev.filter((t) => t !== tag));
          },
        },
      ]
    );
  }

  function handleAdd() {
    onAdd(selected);
    onClose();
  }

  const available = allTagsEver.filter((t) => !existingTags.includes(t));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Previous Tags</Text>
          <Text style={styles.subtitle}>
            Tags you’ve used in any project. Select the ones to add here.
          </Text>
          <ScrollView style={styles.list}>
            {available.length === 0 ? (
              <Text style={styles.emptyText}>No previous tags yet.</Text>
            ) : (
              available.map((tag) => {
                const isSelected = selected.includes(tag);
                return (
                  <View key={tag} style={styles.row}>
                    <TouchableOpacity style={styles.checkArea} onPress={() => toggle(tag)}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.label}>{tag}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeFromPool(tag)} style={styles.deleteBtn}>
                      <Text style={styles.deleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, selected.length === 0 && styles.disabledBtn]}
              onPress={handleAdd}
              disabled={selected.length === 0}
            >
              <Text style={styles.addText}>
                Add {selected.length > 0 ? `(${selected.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  box: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '75%',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#333' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 12 },
  list: { marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#888', paddingVertical: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkArea: {
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
  label: { fontSize: 15, color: '#333' },
  deleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  deleteText: { fontSize: 14, color: '#c0392b', fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  cancelText: { fontSize: 14, color: '#555' },
  addBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    backgroundColor: '#1565C0',
  },
  addText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  disabledBtn: { opacity: 0.5 },
});
