import NetInfo from '@react-native-community/netinfo';
import * as DriveService from './DriveService';
import * as StorageService from './StorageService';

let _isRunning = false;

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
        console.warn('Queue upload failed for', item.filename, err);
        await StorageService.updateQueueItemStatus(item.localPath, {
          lastError: err.message,
          lastAttemptAt: new Date().toISOString(),
        });
        continue; // Skip failed item; try remaining items
      }
    }
  } finally {
    _isRunning = false;
  }
}
