import NetInfo from '@react-native-community/netinfo';
import * as DriveService from './DriveService';
import * as StorageService from './StorageService';

let _isRunning = false;

// Called the FIRST time a given queue item fails to upload (not on every
// retry of an already-failing item), with (item, error). This exists because
// of a real incident: uploads failed silently for days behind a
// console.warn + continue, looking exactly like a slow network. The sync
// banner's tap-for-details came out of that incident; this callback is the
// proactive half — the UI (ScannerScreen) uses it to announce a failure the
// moment it first happens instead of waiting to be asked.
let _onNewFailure = null;
export function setOnNewFailure(fn) {
  _onNewFailure = fn;
}

export async function processQueue() {
  if (_isRunning) return;
  _isRunning = true;

  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    const queue = await StorageService.loadQueue();
    for (const item of queue) {
      try {
        // Each item resolves its own Box/Folder subfolder under its own
        // project's root folder — never the currently-active project's.
        const destinationFolderId = await DriveService.resolveDestinationFolder(
          item.folderId,
          item.metadata?.box,
          item.metadata?.folder
        );
        await DriveService.uploadPDF({
          localPath: item.localPath,
          filename: item.filename,
          folderId: destinationFolderId,
          metadata: item.metadata,
        });
        await StorageService.removeFromQueue(item.localPath);
      } catch (err) {
        const firstFailure = !item.lastError;
        console.warn('Queue upload failed for', item.filename, err);
        await StorageService.updateQueueItemStatus(item.localPath, {
          lastError: err.message,
          lastAttemptAt: new Date().toISOString(),
        });
        if (firstFailure && _onNewFailure) {
          try {
            _onNewFailure(item, err);
          } catch (notifyErr) {
            console.warn('Failure notifier itself failed', notifyErr);
          }
        }
        continue; // Skip failed item; try remaining items
      }
    }
  } finally {
    _isRunning = false;
  }
}
