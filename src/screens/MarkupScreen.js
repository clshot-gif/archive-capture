import React, { useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Alert,
  TextInput, Modal, ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import { PanResponder } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MarkupScreen({ route, navigation }) {
  const { photoUri, box, folder, pages = [] } = route.params;

  const [tool, setTool] = useState('pen');
  const toolRef = useRef('pen');
  const [omg, setOmg] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  const [saving, setSaving] = useState(false);
  const [imgLayout, setImgLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 180 });

  // Type comment
  const [commentVisible, setCommentVisible] = useState(false);
  const [commentText, setCommentText] = useState('');

  // ─── Drawing (single-finger only; two-finger goes to ScrollView for zoom) ──

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 1,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 1,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath({ points: [[locationX, locationY]], tool: toolRef.current });
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches.length > 1) return;
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) =>
          prev ? { ...prev, points: [...prev.points, [locationX, locationY]] } : null
        );
      },
      onPanResponderRelease: () => {
        setCurrentPath((prev) => {
          if (prev && prev.points.length > 1) {
            setPaths((p) => [...p, prev]);
          }
          return null;
        });
      },
    })
  ).current;

  function pointsToD(points) {
    if (points.length < 2) return '';
    const [first, ...rest] = points;
    return `M${first[0]},${first[1]} ` + rest.map(([x, y]) => `L${x},${y}`).join(' ');
  }

  // ─── Build page result ─────────────────────────────────────────────────────

  async function buildPageResult() {
    const hasMarkup = paths.length > 0;
    const svgMarkup = paths
      .map(({ points, tool: t }) =>
        `<path d="${pointsToD(points)}" stroke="${t === 'highlighter' ? 'rgba(255,235,59,0.6)' : '#111'}" stroke-width="${t === 'highlighter' ? 24 : 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join('\n');

    // Downscale before embedding as base64 — full-res camera photos (4000px+ on
    // modern phones) can silently fail to render as a data: URI <img> in the
    // expo-print WebView, producing a blank page. 1600px wide is plenty for a
    // scanned document and keeps the HTML payload small.
    const manipResult = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: 1600 } }],
      { format: ImageManipulator.SaveFormat.JPEG, base64: true, compress: 0.8 }
    );

    return {
      base64Image: manipResult.base64,
      svgMarkup,
      svgViewBox: `0 0 ${imgLayout.width} ${imgLayout.height}`,
      omg,
      typedComment: commentText,
      hasMarkup,
    };
  }

  // ─── Keep Scanning ─────────────────────────────────────────────────────────

  async function handleKeepScanning() {
    setSaving(true);
    try {
      const pageResult = await buildPageResult();
      navigation.navigate('Scanner', {
        pages: [...pages, pageResult],
        autoCapture: true,
      });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Save (final page → Confirmation) ─────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const pageResult = await buildPageResult();
      navigation.navigate('Confirmation', {
        pages: [...pages, pageResult],
        box,
        folder,
      });
    } catch (err) {
      Alert.alert('Save error', err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Main Markup render ────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolBtn, tool === 'pen' && styles.toolActive]}
          onPress={() => { setTool('pen'); toolRef.current = 'pen'; }}
        >
          <Text style={styles.toolIcon}>✏️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolBtn, tool === 'highlighter' && styles.toolActive]}
          onPress={() => { setTool('highlighter'); toolRef.current = 'highlighter'; }}
        >
          <Text style={styles.toolIcon}>🖊</Text>
          <View style={styles.hlIndicator} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.undoBtn}
          onPress={() => setPaths((p) => p.slice(0, -1))}
        >
          <Text style={styles.undoText}>↩ Undo</Text>
        </TouchableOpacity>

        {/* Page indicator */}
        {pages.length > 0 && (
          <View style={styles.pageIndicator}>
            <Text style={styles.pageIndicatorText}>Pg {pages.length + 1}</Text>
          </View>
        )}

        {/* OMG toggle */}
        <TouchableOpacity
          style={[styles.omgBtn, omg && styles.omgActive]}
          onPress={() => setOmg((v) => !v)}
        >
          <Text style={[styles.omgText, omg && styles.omgTextActive]}>
            {omg ? 'OMG' : '☐'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Zoomable canvas */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flex: 1 }}
        maximumZoomScale={5}
        minimumZoomScale={1}
        pinchGestureEnabled={true}
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bouncesZoom={false}
      >
        <View
          style={styles.canvas}
          onLayout={(e) => setImgLayout({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri: photoUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
          <Svg
            style={StyleSheet.absoluteFill}
            viewBox={`0 0 ${imgLayout.width} ${imgLayout.height}`}
          >
            {paths.map((p, i) => (
              <Path
                key={i}
                d={pointsToD(p.points)}
                stroke={p.tool === 'highlighter' ? 'rgba(255,235,59,0.6)' : '#111'}
                strokeWidth={p.tool === 'highlighter' ? 24 : 3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPath && (
              <Path
                d={pointsToD(currentPath.points)}
                stroke={currentPath.tool === 'highlighter' ? 'rgba(255,235,59,0.6)' : '#111'}
                strokeWidth={currentPath.tool === 'highlighter' ? 24 : 3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentVisible(true)}>
          <Text style={styles.actionText}>TYPE{'\n'}COMMENT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleKeepScanning}
          disabled={saving}
        >
          <Text style={styles.actionText}>KEEP{'\n'}SCANNING</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.saveActionBtn]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.actionText, { color: '#fff' }]}>SAVE</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Type Comment Modal */}
      <Modal visible={commentVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Type a Comment</Text>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              placeholder="Notes about this document…"
              textAlignVertical="top"
              autoFocus
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setCommentVisible(false)}>
              <Text style={styles.primaryBtnText}>Save Comment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 48,
    paddingBottom: 8,
    backgroundColor: '#1A1A2E',
    gap: 8,
  },
  toolBtn: { padding: 8, borderRadius: 8, alignItems: 'center' },
  toolActive: { backgroundColor: '#1565C0' },
  toolIcon: { fontSize: 22 },
  hlIndicator: {
    width: 22, height: 6,
    backgroundColor: 'rgba(255,235,59,0.8)',
    borderRadius: 3, marginTop: 2,
  },
  undoBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginLeft: 4,
  },
  undoText: {
    color: '#1A1A2E',
    fontSize: 15,
    fontWeight: '700',
  },
  pageIndicator: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  pageIndicatorText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  omgBtn: {
    marginLeft: 'auto', padding: 8, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  omgActive: { backgroundColor: '#B71C1C' },
  omgText: { fontSize: 16, color: '#aaa', fontWeight: '700' },
  omgTextActive: { color: '#fff', fontWeight: '900' },
  canvas: { flex: 1 },
  actions: {
    flexDirection: 'row', padding: 12, gap: 8,
    backgroundColor: '#1A1A2E', paddingBottom: 32,
  },
  actionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  saveActionBtn: { backgroundColor: '#1565C0' },
  actionText: {
    color: '#ddd', fontSize: 12, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    padding: 24, paddingTop: 56, paddingBottom: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16 },
  commentInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 15, height: 140, marginBottom: 16, backgroundColor: '#fafafa',
  },
  primaryBtn: { backgroundColor: '#1565C0', padding: 14, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
