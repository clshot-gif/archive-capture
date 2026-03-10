import * as FileSystem from 'expo-file-system/legacy';
import Config from '../config/Config';

let _accessToken = null;

export function setAccessToken(token) {
  _accessToken = token;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${_accessToken}`,
  };
}

// ─── Folder ───────────────────────────────────────────────────────────────────

export async function findOrCreateFolder(name) {
  const folderName = `${Config.DRIVE_FOLDER_PREFIX} — ${name}`;

  // Search for existing folder
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: authHeaders() }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return { id: searchData.files[0].id, name: folderName };
  }

  // Create new folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const folder = await createRes.json();
  return { id: folder.id, name: folderName };
}

// ─── Upload PDF ───────────────────────────────────────────────────────────────
// Two-step: create file metadata first, then stream binary content.
// Avoids readAsStringAsync (deprecated in expo-file-system SDK 55).

export async function uploadPDF({ localPath, filename, folderId, metadata }) {
  // Step 1: Create file with metadata only (no content yet)
  const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: filename,
      parents: [folderId],
      properties: flattenMetadata(metadata),
    }),
  });
  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Drive create failed: ${metaRes.status} ${err}`);
  }
  const { id: fileId } = await metaRes.json();

  // Step 2: Upload binary content using FileSystem.uploadAsync (no base64 needed)
  const uploadRes = await FileSystem.uploadAsync(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    localPath,
    {
      httpMethod: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/pdf' },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }
  );
  if (uploadRes.status !== 200) {
    throw new Error(`Drive upload failed: ${uploadRes.status} ${uploadRes.body}`);
  }

  return fileId;
}

// ─── Update Metadata ──────────────────────────────────────────────────────────

export async function updateFileMetadata(fileId, metadata) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: flattenMetadata(metadata) }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive metadata update failed: ${res.status} ${errText}`);
  }
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenMetadata(meta) {
  // Drive properties values must be strings
  const result = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue;
    result[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return result;
}

