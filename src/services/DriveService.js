import * as FileSystem from 'expo-file-system/legacy';
import Config from '../config/Config';
import { packProps } from '../utils/driveProps';

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

// Google caps uploadType=media "simple" uploads at 5MB. A long GO MODE
// session can build a PDF past that (1600px JPEGs at 0.8 quality ≈ a few
// hundred KB/page — roughly 15–30 pages), and the failure mode is the
// filename-incident one: saves and queues fine on the phone, then the actual
// upload fails every retry. Files over this threshold go through Drive's
// resumable protocol instead (one extra request to open a session, then the
// same native single-shot upload of the whole file — resumable sessions
// accept the full content in one PUT and take files far beyond 5MB).
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

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
  const info = await FileSystem.getInfoAsync(localPath, { size: true });
  const size = info?.size || 0;

  let uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  let httpMethod = 'PATCH';
  if (size > SIMPLE_UPLOAD_LIMIT) {
    const initRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`,
      {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'application/pdf',
          'X-Upload-Content-Length': String(size),
        },
        body: JSON.stringify({}),
      }
    );
    if (!initRes.ok) {
      throw new Error(`Drive resumable init failed: ${initRes.status} ${await initRes.text()}`);
    }
    const sessionUri = initRes.headers.get('location') || initRes.headers.get('Location');
    if (!sessionUri) throw new Error('Drive resumable init returned no session URI');
    uploadUrl = sessionUri;
    httpMethod = 'PUT'; // session uploads take the content via PUT
  }

  const uploadRes = await FileSystem.uploadAsync(uploadUrl, localPath, {
    httpMethod,
    headers: { ...authHeaders(), 'Content-Type': 'application/pdf' },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    throw new Error(
      `Drive upload failed: ${uploadRes.status} ${String(uploadRes.body || '').slice(0, 300)}`
    );
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
      body: JSON.stringify({ properties: flattenMetadata(metadata, { forUpdate: true }) }),
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
// forever, with no visible error).
//
// The old defense truncated the value with an ellipsis — which kept uploads
// alive but silently destroyed data: a truncated typed_comments/tags is
// invalid JSON, and review-ui's reader used to swallow that and show the
// field as empty. Oversized values are now split losslessly across
// continuation properties (typed_comments, typed_comments~1, …) by the same
// packProps that review-ui writes and reassembles with — the scheme lives in
// src/utils/driveProps.js, kept byte-identical between the two repos.
function flattenMetadata(meta, { forUpdate = false } = {}) {
  // Drive properties values must be strings
  const flat = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue;
    flat[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  // forUpdate makes packProps clear stale continuation keys (Drive merges
  // properties per-key on PATCH) — only relevant to updateFileMetadata;
  // files.create has no stale keys to clear.
  return packProps(flat, { forUpdate });
}

