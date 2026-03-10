import NetInfo from '@react-native-community/netinfo';
import * as DriveService from './DriveService';
import * as StorageService from './StorageService';

let _isRunning = false;

export async function processQueue(folderId) {
  if (_isRunning) return;
  _isRunning = true;

  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    const queue = await StorageService.loadQueue();
    for (const item of queue) {
      try {
        await DriveService.uploadPDF({
          localPath: item.localPath,
          filename: item.filename,
          folderId,
          metadata: item.metadata,
        });
        await StorageService.removeFromQueue(item.localPath);
      } catch (err) {
        console.warn('Queue upload failed for', item.filename, err);
        break; // Stop on first failure; retry later
      }
    }
  } finally {
    _isRunning = false;
  }
}
