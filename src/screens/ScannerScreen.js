import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as StorageService from '../services/StorageService';
import * as UploadQueueService from '../services/UploadQueueService';
import * as DriveService from '../services/DriveService';

export default function ScannerScreen({ route, navigation }) {
  const pages = route.params?.pages ?? [];

  const [box, setBox] = useState('');
  const [folder, setFolder] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [project, setProject] = useState(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    loadState();
    const unsub = navigation.addListener('focus', () => {
      loadState();
      refreshQueue();
    });
    return unsub;
  }, [navigation]);

  // Auto-open camera when returning from MarkupScreen via Keep Scanning
  useEffect(() => {
    if (!route.params?.autoCapture) return;
    navigation.setParams({ autoCapture: undefined });
    openCamera();
  }, [route.params?.autoCapture]);

  async function loadState() {
    const proj = await StorageService.loadProject();
    setProject(proj);
    try {
      const { accessToken } = await GoogleSignin.getTokens();
      DriveService.setAccessToken(accessToken);
      if (proj) {
        UploadQueueService.processQueue(proj.driveFolderId);
      }
    } catch (_) {
      // Not signed in or token unavailable; Drive uploads will queue
    }
    refreshQueue();
  }

  async function refreshQueue() {
    const queue = await StorageService.loadQueue();
    setQueueCount(queue.length);
  }

  async function openCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera access is required to scan documents.');
        return;
      }
    }
    setShowCamera(true);
  }

  async function handleCapture() {
    await openCamera();
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      });
      setShowCamera(false);
      navigation.navigate('Markup', {
        photoUri: photo.uri,
        box: box.trim(),
        folder: folder.trim(),
        pages,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not capture photo: ' + err.message);
    }
  }

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
        />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCamera(false)}>
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shutterBtn} onPress={takePicture}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <View style={{ width: 48 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar: Box + Folder */}
      <View style={styles.topBar}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Box</Text>
          <TextInput
            style={styles.fieldInput}
            value={box}
            onChangeText={setBox}
            keyboardType="default"
            placeholder="—"
            returnKeyType="next"
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Folder</Text>
          <TextInput
            style={styles.fieldInput}
            value={folder}
            onChangeText={setFolder}
            keyboardType="default"
            placeholder="—"
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Queue indicator */}
      {queueCount > 0 && (
        <View style={styles.queueBanner}>
          <Text style={styles.queueText}>
            {queueCount} waiting to sync…
          </Text>
        </View>
      )}

      {/* Multi-page indicator */}
      {pages.length > 0 && (
        <View style={styles.pageBanner}>
          <Text style={styles.pageText}>
            Page {pages.length + 1} — tap to add
          </Text>
        </View>
      )}

      {/* Camera button */}
      <View style={styles.center}>
        <TouchableOpacity style={styles.cameraBtn} onPress={handleCapture}>
          <Text style={styles.cameraBtnIcon}>📷</Text>
          <Text style={styles.cameraBtnLabel}>Tap to Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Settings */}
      <TouchableOpacity
        style={styles.settingsBtn}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 16,
  },
  fieldGroup: { flex: 1 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  queueBanner: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  queueText: { fontSize: 13, color: '#E65100', textAlign: 'center' },
  pageBanner: {
    backgroundColor: '#E8EAF6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C5CAE9',
  },
  pageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A237E',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBtn: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cameraBtnIcon: { fontSize: 64 },
  cameraBtnLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  settingsBtn: {
    position: 'absolute',
    top: 56,
    right: 16,
  },
  settingsIcon: { fontSize: 24 },
  cameraControls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  cancelBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
});
