import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as StorageService from '../services/StorageService';
import * as DriveService from '../services/DriveService';
import Config from '../config/Config';

export default function SettingsScreen({ navigation }) {
  const [project, setProject] = useState(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const proj = await StorageService.loadProject();
    const isIn = await StorageService.loadSignedIn();
    setProject(proj);
    setSignedIn(isIn);
  }

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

  function openDriveFolder() {
    if (project?.driveFolderId) {
      Linking.openURL(`https://drive.google.com/drive/folders/${project.driveFolderId}`);
    }
  }

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

      <Section title="Project Info">
        <InfoRow label="Collection" value={project?.collectionName} />
        <InfoRow label="Research Question" value={project?.researchQuestion} multiline />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Drive Folder</Text>
          <TouchableOpacity onPress={openDriveFolder}>
            <Text style={[styles.rowValue, styles.link]} numberOfLines={1}>
              {project?.driveFolderName || '—'}
            </Text>
          </TouchableOpacity>
        </View>
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

function InfoRow({ label, value, multiline }) {
  return (
    <View style={[styles.row, multiline && { alignItems: 'flex-start', paddingVertical: 12 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, multiline && { flexShrink: 1, textAlign: 'right' }]}
        numberOfLines={multiline ? 4 : 1}
      >
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
