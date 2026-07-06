import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Alert,
  TextInput, Modal, ActivityIndicator, Dimensions, Animated,
} from 'react-native';
import { PanResponder } from 'react-native';
import { PinchGestureHandler, PanGestureHandler, State as GHState } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { buildPlainPageResult } from '../utils/pageBuilder';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// The Image renders with resizeMode="contain" inside its container, so
// unless the container's aspect ratio happens to exactly match the photo's,
// there are blank letterbox margins on two sides. The exported PDF has no
// such margins (the page is sized to match the photo exactly), so drawing
// coordinates measured against the full container — margins included — land
// in the wrong place once mapped onto the margin-free PDF image. Computing
// the actual visible image rectangle and drawing only within that fixes the
// mismatch regardless of zoom.
function computeContentRect(containerWidth, containerHeight, naturalWidth, naturalHeight) {
  if (!containerWidth || !containerHeight) {
    return { width: containerWidth || 0, height: containerHeight || 0 };
  }
  if (!naturalWidth || !naturalHeight) {
    return { width: containerWidth, height: containerHeight };
  }
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = naturalWidth / naturalHeight;
  if (imageAspect > containerAspect) {
    return { width: containerWidth, height: containerWidth / imageAspect };
  }
  return { width: containerHeight * imageAspect, height: containerHeight };
}

export default function MarkupScreen({ route, navigation }) {
  const { photoUri, box, folder, pages = [] } = route.params;

  const [tool, setTool] = useState('pen');
  const toolRef = useRef('pen');
  const [omg, setOmg] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  const [saving, setSaving] = useState(false);
  const [containerLayout, setContainerLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 180 });
  const [naturalSize, setNaturalSize] = useState(null);

  useEffect(() => {
    Image.getSize(
      photoUri,
      (width, height) => setNaturalSize({ width, height }),
      () => setNaturalSize(null)
    );
  }, [photoUri]);

  // The rectangle the image actually occupies within its container, once
  // resizeMode="contain" letterboxing is accounted for — see
  // computeContentRect above for why this (not the raw container box) is
  // what drawing coordinates and the exported viewBox need to be based on.
  const imgLayout = useMemo(
    () => computeContentRect(
      containerLayout.width,
      containerLayout.height,
      naturalSize?.width,
      naturalSize?.height
    ),
    [containerLayout.width, containerLayout.height, naturalSize]
  );

  // Type comment
  const [commentVisible, setCommentVisible] = useState(false);
  const [commentText, setCommentText] = useState('');

  // ─── Pinch to zoom / two-finger pan ─────────────────────────────────────────
  // React Native's ScrollView zoom (maximumZoomScale) only works on iOS, so
  // pinch-to-zoom needs its own implementation here via gesture-handler.
  // baseScale/baseTranslate hold the committed value from prior gestures;
  // pinchScale/panTranslate hold the current in-progress gesture's delta.
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scaleValue = useRef(1);
  const combinedScale = useRef(Animated.multiply(baseScale, pinchScale)).current;

  const baseTranslateX = useRef(new Animated.Value(0)).current;
  const baseTranslateY = useRef(new Animated.Value(0)).current;
  const panTranslateX = useRef(new Animated.Value(0)).current;
  const panTranslateY = useRef(new Animated.Value(0)).current;
  const translateXValue = useRef(0);
  const translateYValue = useRef(0);
  const combinedTranslateX = useRef(Animated.add(baseTranslateX, panTranslateX)).current;
  const combinedTranslateY = useRef(Animated.add(baseTranslateY, panTranslateY)).current;

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  function onPinchHandlerStateChange(event) {
    if (event.nativeEvent.oldState === GHState.ACTIVE) {
      scaleValue.current = clamp(scaleValue.current * event.nativeEvent.scale, MIN_ZOOM, MAX_ZOOM);
      baseScale.setValue(scaleValue.current);
      pinchScale.setValue(1);
      if (scaleValue.current === MIN_ZOOM) {
        translateXValue.current = 0;
        translateYValue.current = 0;
        baseTranslateX.setValue(0);
        baseTranslateY.setValue(0);
      }
    }
  }

  const onPanGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: panTranslateX, translationY: panTranslateY } }],
    { useNativeDriver: true }
  );

  function onPanHandlerStateChange(event) {
    if (event.nativeEvent.oldState === GHState.ACTIVE) {
      translateXValue.current += event.nativeEvent.translationX;
      translateYValue.current += event.nativeEvent.translationY;
      baseTranslateX.setValue(translateXValue.current);
      baseTranslateY.setValue(translateYValue.current);
      panTranslateX.setValue(0);
      panTranslateY.setValue(0);
    }
  }

  // ─── Drawing (single-finger only; two-finger goes to pinch/pan above) ──────

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
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => false,
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

    const base = await buildPlainPageResult(photoUri);

    return {
      ...base,
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
            OMG
          </Text>
        </TouchableOpacity>
      </View>

      {/* Zoomable canvas */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={panRef}
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchHandlerStateChange}
        >
          <Animated.View style={{ flex: 1 }}>
            <PanGestureHandler
              ref={panRef}
              simultaneousHandlers={pinchRef}
              onGestureEvent={onPanGestureEvent}
              onHandlerStateChange={onPanHandlerStateChange}
              minPointers={2}
              maxPointers={2}
            >
              <Animated.View
                style={[
                  styles.canvas,
                  {
                    transform: [
                      { translateX: combinedTranslateX },
                      { translateY: combinedTranslateY },
                      { scale: combinedScale },
                    ],
                  },
                ]}
                onLayout={(e) => setContainerLayout({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })}
              >
                <View
                  style={{ width: imgLayout.width, height: imgLayout.height }}
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
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </View>

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
              placeholderTextColor="#999"
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
  canvas: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
    padding: 12, fontSize: 15, height: 140, marginBottom: 16,
    color: '#222', backgroundColor: '#fafafa',
  },
  primaryBtn: { backgroundColor: '#1565C0', padding: 14, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
