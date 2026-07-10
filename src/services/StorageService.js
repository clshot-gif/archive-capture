import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  PROJECT: 'project_state',
  TAGS: 'tag_vocabulary', // legacy global tag list — kept only for one-time migration
  TAGS_BY_PROJECT: 'tags_by_project',
  ALL_TAGS_EVER: 'all_tags_ever',
  COUNTERS_BY_SCOPE: 'file_counters_by_scope',
  UPLOAD_QUEUE: 'upload_queue',
  SIGNED_IN: 'signed_in',
  BOX_FOLDER: 'box_folder',
  PROJECTS_LIST: 'projects_list',
  ACTIVE_PROJECT_ID: 'active_project_id',
};

// ─── Project State ────────────────────────────────────────────────────────────

export async function saveProject(project) {
  await AsyncStorage.setItem(KEYS.PROJECT, JSON.stringify(project));
}

export async function loadProject() {
  const raw = await AsyncStorage.getItem(KEYS.PROJECT);
  return raw ? JSON.parse(raw) : null;
}

// ─── Multi-Project Support ────────────────────────────────────────────────────

export async function saveProjectsList(projects) {
  await AsyncStorage.setItem(KEYS.PROJECTS_LIST, JSON.stringify(projects));
}

export async function loadProjectsList() {
  const raw = await AsyncStorage.getItem(KEYS.PROJECTS_LIST);
  return raw ? JSON.parse(raw) : [];
}

export async function saveActiveProjectId(id) {
  await AsyncStorage.setItem(KEYS.ACTIVE_PROJECT_ID, id);
}

export async function loadActiveProjectId() {
  return await AsyncStorage.getItem(KEYS.ACTIVE_PROJECT_ID);
}

export async function getActiveProject() {
  const [list, activeId] = await Promise.all([loadProjectsList(), loadActiveProjectId()]);
  return list.find((p) => p.id === activeId) ?? null;
}

// One-time migration: if projects_list is empty but old project_state exists, import it
export async function migrateProjectIfNeeded() {
  const list = await loadProjectsList();
  if (list.length > 0) return;
  const raw = await AsyncStorage.getItem(KEYS.PROJECT);
  if (!raw) return;
  const old = JSON.parse(raw);
  const migrated = {
    id: Date.now().toString(),
    name: old.collectionName || 'Untitled',
    archiveName: '',
    driveFolderId: old.driveFolderId,
    driveFolderName: old.driveFolderName,
    createdAt: new Date().toISOString(),
  };
  await saveProjectsList([migrated]);
  await saveActiveProjectId(migrated.id);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
// Each project has its own tag list (fresh/empty for a brand new project),
// separate from a global "every tag ever used, in any project" pool. The
// global pool feeds the "Previous Tags" picker so a tagging convention from
// one project can be reused in another without every project's list growing
// unbounded by default.

export async function loadTagsForProject(projectId) {
  const raw = await AsyncStorage.getItem(KEYS.TAGS_BY_PROJECT);
  const map = raw ? JSON.parse(raw) : {};
  return map[projectId] || [];
}

export async function saveTagsForProject(projectId, tags) {
  const raw = await AsyncStorage.getItem(KEYS.TAGS_BY_PROJECT);
  const map = raw ? JSON.parse(raw) : {};
  map[projectId] = tags;
  await AsyncStorage.setItem(KEYS.TAGS_BY_PROJECT, JSON.stringify(map));
  await addToAllTagsEver(tags);
}

export async function loadAllTagsEver() {
  const raw = await AsyncStorage.getItem(KEYS.ALL_TAGS_EVER);
  return raw ? JSON.parse(raw) : [];
}

async function addToAllTagsEver(newTags) {
  if (newTags.length === 0) return;
  const existing = await loadAllTagsEver();
  const merged = Array.from(new Set([...existing, ...newTags]));
  await AsyncStorage.setItem(KEYS.ALL_TAGS_EVER, JSON.stringify(merged));
}

export async function deleteFromAllTagsEver(tag) {
  const existing = await loadAllTagsEver();
  await AsyncStorage.setItem(
    KEYS.ALL_TAGS_EVER,
    JSON.stringify(existing.filter((t) => t !== tag))
  );
}

// One-time migration: the old single global tag list becomes the currently
// active project's starting list (so in-progress tags aren't lost) and also
// seeds the new "ever used" pool.
export async function migrateTagsIfNeeded() {
  const alreadyMigrated = await AsyncStorage.getItem(KEYS.TAGS_BY_PROJECT);
  if (alreadyMigrated) return;
  const oldRaw = await AsyncStorage.getItem(KEYS.TAGS);
  const oldTags = oldRaw ? JSON.parse(oldRaw) : [];
  const activeId = await loadActiveProjectId();
  const map = activeId && oldTags.length > 0 ? { [activeId]: oldTags } : {};
  await AsyncStorage.setItem(KEYS.TAGS_BY_PROJECT, JSON.stringify(map));
  await addToAllTagsEver(oldTags);
}

// ─── File Counter ─────────────────────────────────────────────────────────────
// Counts restart at 1 within each scope (a project + Box + Folder
// combination) rather than counting up across the whole app, since that's
// the numbering she actually wants to see inside a given Drive folder. This
// stays a purely local counter — same as before — so it still works offline;
// it just resets whenever the box/folder text changes rather than only once
// per app install.

export async function getNextCounterForScope(scopeKey) {
  const raw = await AsyncStorage.getItem(KEYS.COUNTERS_BY_SCOPE);
  const counters = raw ? JSON.parse(raw) : {};
  const next = (counters[scopeKey] || 0) + 1;
  counters[scopeKey] = next;
  await AsyncStorage.setItem(KEYS.COUNTERS_BY_SCOPE, JSON.stringify(counters));
  return next;
}

export function formatCounter(n) {
  return String(n).padStart(6, '0');
}

// ─── Upload Queue ─────────────────────────────────────────────────────────────

export async function loadQueue() {
  const raw = await AsyncStorage.getItem(KEYS.UPLOAD_QUEUE);
  return raw ? JSON.parse(raw) : [];
}

export async function addToQueue(item) {
  const queue = await loadQueue();
  queue.push(item);
  await AsyncStorage.setItem(KEYS.UPLOAD_QUEUE, JSON.stringify(queue));
}

export async function removeFromQueue(localPath) {
  const queue = await loadQueue();
  const filtered = queue.filter((i) => i.localPath !== localPath);
  await AsyncStorage.setItem(KEYS.UPLOAD_QUEUE, JSON.stringify(filtered));
}

// Records why a queued item's last upload attempt failed, so a stuck queue
// is diagnosable from the phone itself instead of requiring a dev console
// (which she has no way to see on a preview build).
export async function updateQueueItemStatus(localPath, { lastError, lastAttemptAt }) {
  const queue = await loadQueue();
  const updated = queue.map((item) =>
    item.localPath === localPath ? { ...item, lastError, lastAttemptAt } : item
  );
  await AsyncStorage.setItem(KEYS.UPLOAD_QUEUE, JSON.stringify(updated));
}

export async function clearQueue() {
  await AsyncStorage.setItem(KEYS.UPLOAD_QUEUE, JSON.stringify([]));
}

// ─── Signed In Flag ───────────────────────────────────────────────────────────

export async function saveSignedIn(value) {
  await AsyncStorage.setItem(KEYS.SIGNED_IN, value ? 'true' : 'false');
}

export async function loadSignedIn() {
  const raw = await AsyncStorage.getItem(KEYS.SIGNED_IN);
  return raw === 'true';
}

// ─── Box / Folder Persistence ─────────────────────────────────────────────────

export async function saveBoxFolder({ box, folder }) {
  await AsyncStorage.setItem(KEYS.BOX_FOLDER, JSON.stringify({ box, folder }));
}

export async function loadBoxFolder() {
  const raw = await AsyncStorage.getItem(KEYS.BOX_FOLDER);
  return raw ? JSON.parse(raw) : { box: '', folder: '' };
}

// ─── Reset (dev/debug) ────────────────────────────────────────────────────────

export async function resetAll() {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

