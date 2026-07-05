import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  Linking, TextInput, ActivityIndicator,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as StorageService from '../services/StorageService';
import * as DriveService from '../services/DriveService';

export default function SettingsScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [signedIn, setSignedIn] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newArchiveName, setNewArchiveName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [list, activeId, isIn] = await Promise.all([
      StorageService.loadProjectsList(),
      StorageService.loadActiveProjectId(),
      StorageService.loadSignedIn(),
    ]);
    setProjects(list);
    setActiveProjectId(activeId);
    setSignedIn(isIn);
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  async function handleReconnect() {
    try {
      await GoogleSignin.signOut();
      await GoogleSignin.signIn();
      const { accessToken } = await GoogleSignin.getTokens();
      DriveService.setAccessToken(accessToken);
      await StorageService.saveSignedIn(true);
      setSignedIn(true);
      Alert.alert('Reconnected', 'Google Drive reconnected successfully.');
    } catch (err) {
      Alert.alert('Sign-in error', err.message);
    }
  }

  async function handleSwitchProject(id) {
    await StorageService.saveActiveProjectId(id);
    setActiveProjectId(id);
  }

  async function handleCreateProject() {
    if (!newName.trim()) {
      Alert.alert('Required', 'Please enter a project name.');
      return;
    }
    setCreating(true);
    try {
      const folder = await DriveService.findOrCreateFolder(newName.trim());
      const project = {
        id: Date.now().toString(),
        name: newName.trim(),
        archiveName: newArchiveName.trim(),
        driveFolderId: folder.id,
        driveFolderName: folder.name,
        createdAt: new Date().toISOString(),
      };
      const updated = [...projects, project];
      await StorageService.saveProjectsList(updated);
      await StorageService.saveActiveProjectId(project.id);
      setProjects(updated);
      setActiveProjectId(project.id);
      setNewName('');
      setNewArchiveName('');
      setShowNewForm(false);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  function openDriveFolder(folderId) {
    if (folderId) {
      Linking.openURL(`https://drive.google.com/drive/folders/${folderId}`);
    }
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Section title="Tags">
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TagVocabulary', { fromOnboarding: false })}
        >
          <Text style={styles.rowText}>Edit Tag Vocabulary</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Projects">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <TouchableOpacity
              key={p.id}
              style={styles.row}
              onPress={() => !isActive && handleSwitchProject(p.id)}
              activeOpacity={isActive ? 1 : 0.7}
            >
              <View style={styles.projectIndicatorWrap}>
                <View style={[styles.indicator, isActive && styles.indicatorActive]} />
              </View>
              <View style={styles.projectInfo}>
                <Text style={[styles.projectName, isActive && styles.projectNameActive]}>
                  {p.name}
                </Text>
                {p.archiveName ? (
                  <Text style={styles.projectMeta}>{p.archiveName}</Text>
                ) : null}
              </View>
              {isActive && activeProject?.driveFolderId ? (
                <TouchableOpacity onPress={() => openDriveFolder(activeProject.driveFolderId)}>
                  <Text style={styles.folderLink}>Drive ›</Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {showNewForm ? (
          <View style={styles.newFormContainer}>
            <TextInput
              style={styles.newFormInput}
              placeholder="Project Name"
              placeholderTextColor="#999"
              value={newName}
              onChangeText={setNewName}
              returnKeyType="next"
              autoFocus
            />
            <TextInput
              style={[styles.newFormInput, { marginTop: 8 }]}
              placeholder="Collection (optional)"
              placeholderTextColor="#999"
              value={newArchiveName}
              onChangeText={setNewArchiveName}
              returnKeyType="done"
              onSubmitEditing={handleCreateProject}
            />
            <View style={styles.newFormActions}>
              <TouchableOpacity
                style={styles.cancelFormBtn}
                onPress={() => { setShowNewForm(false); setNewName(''); setNewArchiveName(''); }}
              >
                <Text style={styles.cancelFormText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, creating && styles.disabledBtn]}
                onPress={handleCreateProject}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createBtnText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.row} onPress={() => setShowNewForm(true)}>
            <Text style={styles.addProjectText}>+ New Project</Text>
          </TouchableOpacity>
        )}
      </Section>

      <Section title="Google Drive">
        <InfoRow label="Status" value={signedIn ? 'Connected' : 'Not connected'} />
        <TouchableOpacity style={[styles.row, styles.actionRow]} onPress={handleReconnect}>
          <Text style={styles.actionRowText}>Reconnect Google Drive</Text>
        </TouchableOpacity>
      </Section>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Section({ title, children }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title}</Text>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { marginBottom: 8 },
  backText: { color: '#1565C0', fontSize: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A237E' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowText: { fontSize: 15, color: '#333' },
  rowLabel: { fontSize: 14, color: '#888', flex: 1 },
  rowValue: { fontSize: 14, color: '#333', flex: 2, textAlign: 'right' },
  chevron: { fontSize: 20, color: '#bbb' },
  link: { color: '#1565C0', textDecorationLine: 'underline' },
  actionRow: { backgroundColor: '#fff' },
  actionRowText: { color: '#1565C0', fontSize: 15 },
  // Project rows
  projectIndicatorWrap: { width: 24, alignItems: 'center', marginRight: 4 },
  indicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#bbb',
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    borderColor: '#1565C0',
    backgroundColor: '#1565C0',
  },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 15, color: '#333' },
  projectNameActive: { fontWeight: '700', color: '#1A237E' },
  projectMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  folderLink: { fontSize: 13, color: '#1565C0' },
  addProjectText: { color: '#1565C0', fontSize: 15 },
  // New project inline form
  newFormContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  newFormInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  newFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10,
  },
  cancelFormBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  cancelFormText: { fontSize: 14, color: '#555' },
  createBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#1565C0',
    minWidth: 72,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  disabledBtn: { opacity: 0.6 },
});

const sectionStyles = StyleSheet.create({
  container: { marginTop: 24 },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  body: { backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
});
