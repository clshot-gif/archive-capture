import * as ImageManipulator from 'expo-image-manipulator';

// Downscale + base64-encode a captured photo into the shape ConfirmationScreen's
// PDF builder expects for a page with no markup. Shared by MarkupScreen (for the
// one page she's actively marking up) and ScannerScreen's batch-capture mode
// (for earlier pages in a batch, which are saved unmarked).
export async function buildPlainPageResult(photoUri) {
  // Full-res camera photos (4000px+) can silently fail to render as a data:
  // URI <img> in the expo-print WebView, producing a blank page — 1600px wide
  // is plenty for a scanned document and keeps the HTML payload small.
  const manipResult = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: 1600 } }],
    { format: ImageManipulator.SaveFormat.JPEG, base64: true, compress: 0.8 }
  );
  return {
    base64Image: manipResult.base64,
    imageWidth: manipResult.width,
    imageHeight: manipResult.height,
    svgMarkup: '',
    svgViewBox: `0 0 ${manipResult.width} ${manipResult.height}`,
    omg: false,
    typedComment: '',
    hasMarkup: false,
  };
}
