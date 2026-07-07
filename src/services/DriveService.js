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

function escapeForDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function findOrCreateFolder(name) {
  const folderName = `${Config.DRIVE_FOLDER_PREFIX} — ${name}`;

  // Search for existing folder
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${escapeForDriveQuery(folderName)}' and trashed=false`
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

// Find or create a folder by name inside a specific parent folder (used for
// the Box/Folder subfolder hierarchy nested under a project's root folder).
export async function findOrCreateChildFolder(parentId, name) {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${escapeForDriveQuery(name)}' and '${parentId}' in parents and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: authHeaders() }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return { id: searchData.files[0].id, name: searchData.files[0].name };
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const folder = await createRes.json();
  return { id: folder.id, name: folder.name };
}

// Resolve (creating as needed) the Box/Folder subfolder path under a
// project's root Drive folder. Box and folder are optional — either or both
// may be blank if she hasn't filled those fields in.
export async function resolveDestinationFolder(rootFolderId, box, folder) {
  let targetId = rootFolderId;
  if (box) {
    const boxFolder = await findOrCreateChildFolder(targetId, `Box ${box}`);
    targetId = boxFolder.id;
  }
  if (folder) {
    const folderFolder = await findOrCreateChildFolder(targetId, `Folder ${folder}`);
    targetId = folderFolder.id;
  }
  return targetId;
}

// ─── Upload PDF ───────────────────────────────────────────────────────────────
// Two-step upload: create metadata-only file, then PATCH binary content.
// Uses FileSystem.uploadAsync for native binary upload (no base64 encoding).

export async function uploadPDF({ localPath, filename, folderId, metadata }) {
  // Step 1: create metadata-only file
  const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: filename, parents: [folderId], properties: flattenMetadata(metadata) }),
  });
  if (!metaRes.ok) throw new Error(`Drive create failed: ${metaRes.status} ${await metaRes.text()}`);
  const { id: fileId } = await metaRes.json();

  // Step 2: upload binary content natively (no base64 needed)
  const uploadRes = await FileSystem.uploadAsync(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    localPath,
    {
      httpMethod: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/pdf' },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }
  );
  if (uploadRes.status !== 200) throw new Error(`Drive upload failed: ${uploadRes.status}`);
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

// Drive rejects the whole files.create call if any single properties value
// exceeds its ~124-byte cap (see docs/metadata-schema.md) — this has already
// caused a real silent-upload-failure incident once (a filename-convention
// change made `temp_filename` long enough to tip over the limit for anyone
// with a longer Archive/Collection name, and the file simply never uploaded,
// forever, with no visible error). Truncate defensively so a future naming
// or metadata change can't quietly break uploads the same way again.
const MAX_PROPERTY_LENGTH = 120;

function truncateForDriveProperty(value) {
  if (value.length <= MAX_PROPERTY_LENGTH) return value;
  return `${value.slice(0, MAX_PROPERTY_LENGTH - 1)}…`;
}

function flattenMetadata(meta) {
  // Drive properties values must be strings
  const result = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue;
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    result[k] = truncateForDriveProperty(str);
  }
  return result;
}

