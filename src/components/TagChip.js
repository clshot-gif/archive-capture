import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export default function TagChip({ label, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  function handleSubmit() {
    setEditing(false);
    if (value.trim() && value.trim() !== label) {
      onRename(value.trim());
    } else {
      setValue(label);
    }
  }

  return (
    <View style={styles.chip}>
      {editing ? (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          onBlur={handleSubmit}
          onSubmitEditing={handleSubmit}
          autoFocus
        />
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={styles.label}>{label}</Text>
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    margin: 4,
  },
  label: {
    fontSize: 14,
    color: '#1565C0',
  },
  input: {
    fontSize: 14,
    color: '#1565C0',
    minWidth: 60,
    padding: 0,
  },
  deleteBtn: {
    marginLeft: 6,
    padding: 2,
  },
  deleteText: {
    fontSize: 12,
    color: '#888',
  },
});
