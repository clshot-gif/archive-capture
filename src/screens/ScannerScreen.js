import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Dimensions, Switch,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import NetInfo from '@react-native-community/netinfo';
import * as StorageService from '../services/StorageService';
import * as UploadQueueService from '../services/UploadQueueService';
import * as DriveService from '../services/DriveService';
import { buildPlainPageResult } from '../utils/pageBuilder';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCREEN_ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT;

// The camera preview fills the screen with a "cover" crop, but
// takePictureAsync() returns the full sensor image (usually 4:3), which is
// wider than a typical phone screen — so the saved photo shows extra area
// on the sides beyond what was actually framed in the preview. Center-crop
// the photo to the same aspect ratio as the preview so the save matches
// what she saw on screen.
async function cropToScreenAspect(photo) {
  const photoAspect = photo.width / photo.height;
  let cropWidth = photo.width;
  let cropHeight = photo.height;

  if (photoAspect > SCREEN_ASPECT) {
    cropWidth = Math.round(photo.height * SCREEN_ASPECT);
  } else {
    cropHeight = Math.round(photo.width / SCREEN_ASPECT);
  }

  const originX = Math.round((photo.width - cropWidth) / 2);
  const originY = Math.round((photo.height - cropHeight) / 2);

  const result = await ImageManipulator.manipulateAsync(
    photo.uri,
    [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
  );
  return result;
}

export default function ScannerScreen({ route, navigation }) {
  const pages = route.params?.pages ?? [];

  const [box, setBox] = useState('');
  const [folder, setFolder] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchPhotos, setBatchPhotos] = useState([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [project, setProject] = useState(null);
  const cameraRef = useRef(null);
  const projectRef = useRef(null);

  // Restore box/folder on mount
  useEffect(() => {
    StorageService.loadBoxFolder().then(({ box: b, folder: f }) => {
      if (b) setBox(b);
      if (f) setFolder(f);
    });
  }, []);

  // Persist box/folder whenever they change
  useEffect(() => {
    StorageService.saveBoxFolder({ box, folder });
  }, [box, folder]);

  useEffect(() => {
    loadState();
    const unsub = navigation.addListener('focus', () => {
      loadState();
      refreshQueue();
    });
    // Closing the camera on blur avoids resuming a stale native camera
    // preview surface after navigating to Settings and back (observed as a
    // black preview that only clears when the screen is turned off and on).
    const unsubBlur = navigation.addListener('blur', () => {
      setShowCamera(false);
    });
    const netUnsub = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && projectRef.current) {
        try {
          const { accessToken } = await GoogleSignin.getTokens();
          DriveService.setAccessToken(accessToken);
        } catch (_) { /* not signed in */ }
        UploadQueueService.processQueue()
          .then(() => refreshQueue());
      }
    });
    return () => { unsub(); unsubBlur(); netUnsub(); };
  }, [navigation]);

  // Auto-open camera when returning from MarkupScreen via Keep Scanning
  useEffect(() => {
    if (!route.params?.autoCapture) return;
    navigation.setParams({ autoCapture: undefined });
    openCamera();
  }, [route.params?.autoCapture]);

  async function loadState() {
    await StorageService.migrateProjectIfNeeded();
    const proj = await StorageService.getActiveProject();
    setProject(proj);
    projectRef.current = proj;
    try {
      const { accessToken } = await GoogleSignin.getTokens();
      DriveService.setAccessToken(accessToken);
      if (proj) {
        UploadQueueService.processQueue();
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
      const cropped = await cropToScreenAspect(photo);

      if (batchMode) {
        // Stay in the camera view for the next shot instead of jumping to Markup.
        setBatchPhotos((prev) => [...prev, cropped.uri]);
        return;
      }

      setShowCamera(false);
      navigation.navigate('Markup', {
        photoUri: cropped.uri,
        box: box.trim(),
        folder: folder.trim(),
        pages,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not capture photo: ' + err.message);
    }
  }

  function cancelCamera() {
    setShowCamera(false);
    setBatchPhotos([]);
  }

  // Only the last photo of a batch goes to Markup as the markable page —
  // the rest are saved as unmarked pages ahead of it.
  async function handleBatchDone() {
    if (batchPhotos.length === 0) return;
    setShowCamera(false);
    const lastUri = batchPhotos[batchPhotos.length - 1];
    const earlierUris = batchPhotos.slice(0, -1);
    setBatchPhotos([]);
    try {
      const earlierPageResults = await Promise.all(earlierUris.map(buildPlainPageResult));
      navigation.navigate('Markup', {
        photoUri: lastUri,
        box: box.trim(),
        folder: folder.trim(),
        pages: [...pages, ...earlierPageResults],
      });
    } catch (err) {
      Alert.alert('Error', 'Could not process batch photos: ' + err.message);
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
        {batchMode && batchPhotos.length > 0 && (
          <View style={styles.batchCountBadge}>
            <Text style={styles.batchCountText}>
              {batchPhotos.length} photo{batchPhotos.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelCamera}>
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shutterBtn} onPress={takePicture}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          {batchMode && batchPhotos.length > 0 ? (
            <TouchableOpacity style={styles.doneBatchBtn} onPress={handleBatchDone}>
              <Text style={styles.doneBatchText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Active project label */}
      {project && (
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.projectBar}>
          <Text style={styles.projectBarText}>Project: {project.name}</Text>
        </TouchableOpacity>
      )}

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
        <View style={styles.batchToggleRow}>
          <Text style={styles.batchToggleLabel}>Take multiple photos before marking up</Text>
          <Switch value={batchMode} onValueChange={setBatchMode} />
        </View>

        <TouchableOpacity style={styles.cameraBtn} onPress={handleCapture}>
          <Text style={styles.cameraBtnIcon}>📷</Text>
          <Text style={styles.cameraBtnLabel}>Tap to Scan</Text>
        </TouchableOpacity>

        {/* Box + Folder — placed under the camera button so they're hard to miss */}
        <View style={styles.fieldsBar}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Box</Text>
            <TextInput
              style={styles.fieldInput}
              value={box}
              onChangeText={setBox}
              keyboardType="default"
              placeholder="—"
              placeholderTextColor="#999"
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
              placeholderTextColor="#999"
              returnKeyType="done"
            />
          </View>
        </View>
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
  fieldsBar: {
    flexDirection: 'row',
    marginTop: 40,
    paddingHorizontal: 24,
    gap: 20,
    width: '100%',
  },
  fieldGroup: { flex: 1 },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: '#bbb',
    borderRadius: 10,
    padding: 14,
    fontSize: 22,
    color: '#222',
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
  batchToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
    gap: 12,
  },
  batchToggleLabel: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    textAlign: 'right',
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
  batchCountBadge: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  batchCountText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  doneBatchBtn: {
    width: 64,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBatchText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
  projectBar: {
    backgroundColor: '#E8EAF6',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C5CAE9',
  },
  projectBarText: {
    fontSize: 13,
    color: '#1A237E',
    fontWeight: '600',
    textAlign: 'center',
  },
});
