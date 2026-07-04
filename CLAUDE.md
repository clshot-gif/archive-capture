# Archive Capture — Project Reference

Read this first, before exploring the codebase. It exists so a future session (or a future you) doesn't have to re-derive what's already known. Keep it updated when things change materially — stale docs cost more than no docs.

## Who this is for

Built for a solo, non-technical researcher (Carter's wife) who carries her phone into physical archives and photographs documents. Carter is not a developer — he needs plain-language explanations of git/build/deploy steps, and wants proactive help avoiding secret leaks (API keys, OAuth credentials) since he doesn't have habits built around that yet.

## What the app does

She photographs documents one at a time. Each photo becomes a single- or multi-page PDF with pen/highlighter markup baked in, tagged and saved straight to a flat Google Drive folder. No server, no AI processing during capture — just fast, low-friction scanning that works offline and syncs when connectivity returns. A separate "Phase 2" system (not yet built — see `archive-capture-context-for-phase2.md` in the parent folder) will later read this corpus and do the heavier organizing/analysis work.

## Tech stack

- React Native + Expo SDK 55 (managed workflow), React Native 0.83, React 19
- `@react-native-google-signin/google-signin` — native Google OAuth
- Google Drive REST API directly (no SDK) — folder creation, two-step PDF upload, custom file properties for metadata
- `expo-camera`, `expo-image-manipulator`, `expo-print` (HTML → PDF), `react-native-svg` (markup overlay)
- `@react-native-async-storage/async-storage` for all local state (projects, tags, queue, box/folder)
- `@react-native-community/netinfo` + a local AsyncStorage queue for offline-first upload
- No AI/LLM involvement anywhere in this app (removed 2026-07-04 — see below)

## Screens and current features

- **Onboarding** — Google Sign-In → project name + optional archive name → Drive folder created → **Create Tags** step (manual tag entry, obvious "Skip for now" link, since she usually won't want to set tags up front) → Scanner
- **Scanner** — persistent box/folder text fields, one-tap camera, active-project banner, offline-queue count banner
- **Markup** — pen + highlighter with undo, pinch-zoom canvas, OMG flag, typed comment, "Keep Scanning" to add more pages to the same document before saving
- **Confirmation** — tag checklist (add new tag inline), Done → PDF saved locally, queued for background Drive upload
- **Settings** — switch between projects, reconnect Google Drive, edit tag vocabulary
- **Tag Vocabulary** — add/rename/delete tags; reused both from onboarding (with skip) and from Settings

Multi-page documents, multi-project support, and offline queueing are all implemented and working in the current source — don't assume they still need building.

## Known issues (as of 2026-07-04)

Ranked by real-world impact. None of these have been re-verified on a device yet — the app hasn't been run since Carter got a new phone.

1. **`AppNavigator.js` decides whether to skip onboarding using the old single-project key (`StorageService.loadProject()`/`project_state`), but Onboarding and Settings now only write to the newer `projects_list`/`active_project_id` keys.** Any project created since the multi-project refactor is invisible to the navigator on a cold app start, which would bounce her back to Onboarding and could create a duplicate Drive folder. Not yet fixed — needs `AppNavigator.js` to call `StorageService.migrateProjectIfNeeded()` + `getActiveProject()` instead of `loadProject()`.
2. **`UploadQueueService.processQueue(folderId)` uploads every queued item to whichever project is currently active, ignoring the `folderId` stored on each individual queued item.** Only matters if she has offline items queued and switches active projects before reconnecting — low risk today since she works one archive/project at a time, but worth fixing since multi-project switching exists in the UI.
3. Working tree may have uncommitted changes not yet tested on a real build (check `git status` before assuming the repo matches what's on any phone).
4. `MarkupScreen.js`'s `buildPageResult()` re-encodes the full-resolution camera photo to base64 with no downscaling before embedding it in HTML for `expo-print`. Could be slow or memory-heavy on a high-res phone camera, especially on multi-page documents. Watch for this if saves are slow or fail on the new phone.
5. `android` permission list includes `RECORD_AUDIO`, which nothing in the app uses — an unexplained permission prompt, cosmetic/trust issue only.

### Fixed this session (2026-07-04)
- Removed all AI/Anthropic code (`AnthropicService.js` deleted, `Config.js` no longer has an Anthropic key — it was a placeholder anyway and never actually wired up to any screen). Onboarding never called it in practice; the "AI-generated tags" feature described in old docs was already dead code.
- Registered `TagVocabularyScreen` in `AppNavigator.js` — it existed and was linked from Settings ("Edit Tag Vocabulary") but was never added to the navigator, so tapping that row would have crashed.
- Onboarding now routes to the Create Tags screen (with a skip button) instead of AI tag generation.

## Secret hygiene — read this before touching git

Carter doesn't have established git habits, so default to caution:
- **Never commit `Config.js` with a real secret value.** The Google Web Client ID in there is *not* secret (it's a public OAuth client identifier, safe to ship in an app) — but if any real API key is ever added to this file, don't commit it; use an untracked local file or environment variable instead.
- **The Google OAuth `client_secret_*.json` file that lives loose in the parent `Organizer_Archives` folder is a real secret and is *not* inside this git repo** — keep it that way. It was a one-time download from Google Cloud Console; there's no ongoing need for the app to read it at runtime, so it doesn't need to be near the code at all. Consider moving it out of any folder that might ever become a repo.
- `.gitignore` now has a safety net for `client_secret*.json`, `*credentials*.json`, `*service-account*.json`, and `.env` — so even if one of these lands in this folder by accident, git won't pick it up. Still don't rely on that as the only safeguard.
- Before ever running `git add .` or pushing anywhere (especially if this repo ever gets a GitHub remote), run `git status` first and read the list — don't add blindly.

## Git basics for this project (plain language)

- `git status` — shows what's changed since the last commit. Safe to run anytime, changes nothing.
- `git diff` — shows the actual line-by-line changes not yet committed. Safe, read-only.
- `git add <file>` then `git commit -m "message"` — saves a checkpoint. Use specific filenames, not `git add .`, so you don't accidentally include something you didn't mean to.
- There is currently no remote (no GitHub) — everything lives only on this machine/WSL. That means there's no off-machine backup of commit history; worth keeping in mind.
- Building for the phone is a separate step from git — `eas build -p android --profile preview` (via EAS Build, cloud-based) builds an installable APK from whatever is in this folder right now, committed or not.

## Where things are

- App code: `archive-capture/` (this folder)
- Design/planning docs: `archive-capture-dev-handoff.md`, `archive-capture-context-for-phase2.md`, `Archive Capture.pdf`, `archive-app-claude-code-spec.docx` — all one level up in `Organizer_Archives/`
- `src/config/Config.js` — Google Client ID (not secret) and the Drive folder naming prefix
- `src/services/DriveService.js` — all Drive API calls
- `src/services/StorageService.js` — all local AsyncStorage reads/writes
- `src/services/UploadQueueService.js` — offline queue processor (has known bug #2 above)
