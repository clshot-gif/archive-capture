import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Dimensions, Switch,
  KeyboardAvoidingView, Platform, Linking, Keyboard,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import NetInfo from '@react-native-community/netinfo';
import * as StorageService from '../services/StorageService';
import * as UploadQueueService from '../services/UploadQueueService';
import * as DriveService from '../services/DriveService';
import { buildPlainPageResult } from '../utils/pageBuilder';
import { CONTROL_ROW_BOTTOM, CONTROL_ROW_HEIGHT } from '../constants/layout';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The live preview box is deliberately smaller than the full screen (just
// enough to confirm framing/focus), not full-bleed like MarkupScreen's photo
// view — Box/Folder fields and controls live below it instead of overlaid on
// top of it.
const PREVIEW_WIDTH = SCREEN_WIDTH - 32;
const PREVIEW_HEIGHT = SCREEN_HEIGHT * 0.48;
// PREVIEW_ASPECT (used for photo cropping) always reflects the full-size
// preview, even though the box itself visually shrinks while the keyboard
// is open — that shrink is cosmetic only, to keep Box/Folder visible above
// the keyboard, not a change to what actually gets framed and captured.
const PREVIEW_ASPECT = PREVIEW_WIDTH / PREVIEW_HEIGHT;
const PREVIEW_HEIGHT_KEYBOARD = SCREEN_HEIGHT * 0.22;

// The preview box crops the live feed to PREVIEW_ASPECT ("cover"), but
// takePictureAsync() returns the full sensor image (usually 4:3), which is
// wider than the preview box — so the saved photo shows extra area beyond
// what was actually framed. Center-crop the photo to the same aspect ratio
// as the preview so the save matches what she saw on screen.
async function cropToPreviewAspect(photo) {
  const photoAspect = photo.width / photo.height;
  let cropWidth = photo.width;
  let cropHeight = photo.height;

  if (photoAspect > PREVIEW_ASPECT) {
    cropWidth = Math.round(photo.height * PREVIEW_ASPECT);
  } else {
    cropHeight = Math.round(photo.width / PREVIEW_ASPECT);
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
  const [goMode, setGoMode] = useState(false);
  const [batchPhotos, setBatchPhotos] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [project, setProject] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const cameraRef = useRef(null);
  const projectRef = useRef(null);
  const isFocused = useIsFocused();

  // Shrink the live preview while the keyboard is up so Box/Folder (and the
  // controls below them) stay visible above it instead of being covered.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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

  // Camera is now always live on this screen, so ask for permission up front
  // instead of waiting for a "tap to scan" button.
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  useEffect(() => {
    loadState();
    const unsub = navigation.addListener('focus', () => {
      loadState();
      refreshQueue();
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
    return () => { unsub(); netUnsub(); };
  }, [navigation]);

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

  async function takePicture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      });
      const cropped = await cropToPreviewAspect(photo);

      if (goMode) {
        // Stay on this screen for the next shot instead of jumping to Markup.
        setBatchPhotos((prev) => [...prev, cropped.uri]);
        return;
      }

      if (batchPhotos.length > 0) {
        // GO MODE was turned off after already taking some photos — this
        // regular-mode shot finishes that batch as its last, markable page,
        // same as tapping Save would have.
        await finishBatch(cropped.uri, batchPhotos);
        return;
      }

      navigation.navigate('Markup', {
        photoUri: cropped.uri,
        box: box.trim(),
        folder: folder.trim(),
        pages,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not capture photo: ' + err.message);
    } finally {
      setCapturing(false);
    }
  }

  function openDriveFolder(folderId) {
    if (folderId) {
      Linking.openURL(`https://drive.google.com/drive/folders/${folderId}`);
    }
  }

  // Undoes only the most recently taken GO MODE photo, not the whole batch.
  function retakeLast() {
    setBatchPhotos((prev) => prev.slice(0, -1));
  }

  // Shared by "Save" (finishing on the last GO MODE photo itself) and a
  // regular-mode shot taken after GO MODE was turned off (finishing on that
  // new photo instead) — either way, only the last photo of the batch goes
  // to Markup as the markable page; the rest are saved as unmarked pages
  // ahead of it.
  async function finishBatch(lastUri, earlierUris) {
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

  function handleSaveBatch() {
    if (batchPhotos.length === 0) return;
    const lastUri = batchPhotos[batchPhotos.length - 1];
    const earlierUris = batchPhotos.slice(0, -1);
    finishBatch(lastUri, earlierUris);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Active project label */}
        {project && (
          <View style={styles.projectBar}>
            <TouchableOpacity
              style={styles.projectBarMain}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.projectBarText} numberOfLines={1}>
                {project.archiveName ? `${project.name} - ${project.archiveName}` : project.name}
              </Text>
            </TouchableOpacity>
            {project.driveFolderId ? (
              <TouchableOpacity onPress={() => openDriveFolder(project.driveFolderId)}>
                <Text style={styles.driveLinkText}>Drive ›</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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

        {/* Live camera preview */}
        <View
          style={[
            styles.previewBox,
            keyboardVisible && { height: PREVIEW_HEIGHT_KEYBOARD },
          ]}
        >
          {isFocused && permission?.granted ? (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.previewPlaceholderText}>
                {permission?.granted ? '' : 'Camera permission needed'}
              </Text>
              {!permission?.granted && (
                <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                  <Text style={styles.grantBtnText}>Allow Camera</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {batchPhotos.length > 0 && (
            <View style={styles.batchCountBadge}>
              <Text style={styles.batchCountText}>
                {batchPhotos.length} photo{batchPhotos.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Box + Folder — sit above the camera controls, still hard to miss */}
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

        {/* GO MODE toggle — stay on this screen and keep shooting */}
        <View style={styles.goModeRow}>
          <Text style={styles.goModeLabel}>GO MODE</Text>
          <Switch
            value={goMode}
            onValueChange={setGoMode}
            trackColor={{ false: '#999', true: '#1565C0' }}
            thumbColor="#fff"
            ios_backgroundColor="#999"
          />
        </View>

        {/* Shutter + batch controls */}
        <View style={styles.cameraControls}>
          {batchPhotos.length > 0 ? (
            <TouchableOpacity style={styles.retakeBtn} onPress={retakeLast}>
              <Ionicons name="arrow-undo-outline" size={18} color="#555" />
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 48 }} />
          )}

          <TouchableOpacity
            style={styles.shutterBtn}
            onPress={takePicture}
            disabled={!permission?.granted || capturing}
          >
            <View style={styles.shutterInner}>
              <Ionicons name="camera" size={28} color="#fff" />
            </View>
          </TouchableOpacity>

          {batchPhotos.length > 0 ? (
            <TouchableOpacity style={styles.saveBatchBtn} onPress={handleSaveBatch}>
              <Text style={styles.saveBatchText}>Save</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>

        {/* Settings — lower-right corner, clear of the "waiting to sync"
            banner and the project bar. The project label above is also a
            link to Settings. */}
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  previewBox: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    alignSelf: 'center',
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  previewPlaceholderText: { color: '#fff', fontSize: 14 },
  grantBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  grantBtnText: { color: '#fff', fontWeight: '700' },
  fieldsBar: {
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 24,
    gap: 16,
    width: '100%',
  },
  fieldGroup: { flex: 1 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: '#bbb',
    borderRadius: 8,
    padding: 11,
    fontSize: 18,
    fontWeight: '700',
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
  goModeRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: CONTROL_ROW_BOTTOM + CONTROL_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  goModeLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#333',
    letterSpacing: 0.5,
  },
  settingsBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  settingsIcon: { fontSize: 26 },
  cameraControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: CONTROL_ROW_BOTTOM,
    height: CONTROL_ROW_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retakeBtn: {
    width: 64,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeText: { color: '#555', fontSize: 11, fontWeight: '600', marginTop: 2 },
  batchCountBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  batchCountText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveBatchBtn: {
    width: 64,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBatchText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8EAF6',
    paddingTop: 56,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C5CAE9',
  },
  projectBarMain: { flex: 1 },
  projectBarText: {
    fontSize: 18,
    color: '#1A237E',
    fontWeight: '700',
  },
  driveLinkText: {
    fontSize: 16,
    color: '#1565C0',
    fontWeight: '700',
    marginLeft: 12,
  },
});
