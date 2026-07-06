import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as DriveService from '../services/DriveService';
import * as StorageService from '../services/StorageService';
import Config from '../config/Config';

GoogleSignin.configure({
  webClientId: Config.GOOGLE_WEB_CLIENT_ID,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
  offlineAccess: false,
});

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState('signin'); // signin | collection
  const [projectName, setProjectName] = useState('');
  const [archiveName, setArchiveName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const { accessToken } = await GoogleSignin.getTokens();
      DriveService.setAccessToken(accessToken);
      await StorageService.saveSignedIn(true);
      setStep('collection');
    } catch (err) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled, do nothing
      } else {
        Alert.alert('Sign-in failed', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCollectionSubmit() {
    if (!projectName.trim()) {
      Alert.alert('Required', 'Please enter a collection name.');
      return;
    }
    setLoading(true);
    try {
      const folder = await DriveService.findOrCreateFolder(projectName.trim());
      const project = {
        id: Date.now().toString(),
        name: projectName.trim(),
        archiveName: archiveName.trim(),
        driveFolderId: folder.id,
        driveFolderName: folder.name,
        createdAt: new Date().toISOString(),
      };
      const existing = await StorageService.loadProjectsList();
      await StorageService.saveProjectsList([...existing, project]);
      await StorageService.saveActiveProjectId(project.id);
      navigation.replace('TagVocabulary', { fromOnboarding: true, tags: [] });
    } catch (err) {
      Alert.alert('Setup error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Step: Sign In ─────────────────────────────────────────────────────────
  if (step === 'signin') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Archive Capture</Text>
        <Text style={styles.subtitle}>Sign in with Google to get started</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#1565C0" />
        ) : (
          <TouchableOpacity style={styles.googleBtn} onPress={handleSignIn}>
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ─── Step: Collection Name ──────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.title}>Set Up Your Collection</Text>

        <Text style={styles.label}>Collection Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Sophia Smith Collection"
          placeholderTextColor="#999"
          value={projectName}
          onChangeText={setProjectName}
          returnKeyType="next"
        />

        <Text style={styles.label}>Archive Name (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Smith Family Papers"
          placeholderTextColor="#999"
          value={archiveName}
          onChangeText={setArchiveName}
          returnKeyType="done"
          onSubmitEditing={handleCollectionSubmit}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.disabledBtn]}
          onPress={handleCollectionSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Start Scanning →</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  form: {
    padding: 24,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A237E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 32,
    textAlign: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  googleBtn: {
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  googleBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#1565C0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 32,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
