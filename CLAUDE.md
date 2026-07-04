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

## Status as of 2026-07-04 (end of day)

**The app runs on a real device again.** Carter connected a Pixel 10a over USB, built via `eas build -p android --profile preview` (no local Java/Android Studio needed — build happens in Expo's cloud), and installed the APK with `adb install`. Sign-in initially failed with Google's `DEVELOPER_ERROR` — root cause was the Android OAuth client in Google Cloud Console (Credentials → "Android client 1", project `526107030062`) had the wrong SHA-1 fingerprint registered (a stale/unrelated one, `5E:8F:16:...`) instead of the actual EAS keystore's fingerprint (`09:5B:B4:B6:94:0B:D0:23:1B:43:14:5B:DC:EF:08:32:6D:AB:DD:E8`). Fixed by editing that field in Google Cloud Console directly — no code or build was needed. **If sign-in ever breaks again with `DEVELOPER_ERROR` in logcat, check that field first before touching code.**

### Important: what's actually installed on the phone right now

The installed APK was built **before** the unmarked-backup-page safeguard (commit `5541d63`) was written. It does include the AI-removal / Create-Tags-with-skip / navigator fix (commit `dadfd95`), since that was already on disk when the build ran. It does **not** include: the backup-page banner/CSS changes, the `unmarked_backup_pages` metadata field, the always-queue-uploads change, or the `app.config.js`/EAS Update migration — all of that only exists in source, untested on any device. **First step next session: rebuild and reinstall (`eas build -p android --profile preview`, then `adb install -r`) before drawing any conclusions about whether the backup-page feature works** — the "no banner, no backup page" observation below is expected given this, not necessarily a real bug.

### Field testing notes (2026-07-04) — first real session on the new phone

Carter used the freshly-installed build and reported the following. None of these have been root-caused with certainty; they're recorded here so the next session doesn't have to re-discover them.

1. **Biggest problem — some photos render as a blank/white screen.** Not fully isolated yet, but seemed correlated with pages that have markup and/or a typed comment. **Leading theory:** `MarkupScreen.js`'s `buildPageResult()` (see known issue below) re-encodes the full-resolution camera photo to base64 with no downscaling. The Pixel 10a's camera almost certainly produces much larger photos than whatever device this was last tested on, and `expo-print`'s underlying WebView may have a practical size/memory limit on `data:` URI images — if it's hit, the `<img>` can silently fail to render while a sibling comment or markup overlay (small, text/vector) still shows fine, which would look exactly like "blank except for markup/comment." This may correlate with markup/comments rather than being caused by them (documents she marks up may just tend to be higher-detail photos). **Next step:** add an explicit resize (e.g. `ImageManipulator.manipulateAsync(photoUri, [{ resize: { width: 1600 } }], {...})`) and retest with a known-large photo before assuming anything else is wrong.
2. **Old projects don't show up anymore.** Most likely explanation: `AsyncStorage` is per-device local storage with no cloud sync — a new phone always starts with an empty project list, tag vocabulary, and box/folder memory, since only the scanned PDFs + Drive metadata are cloud-synced, not the app's local state. This is expected behavior given the current architecture, not a bug, but it does mean **a lost/reset/reinstalled phone currently loses all project setup even though the actual documents are safe** — worth a product discussion about whether to back up project/tag config into Drive too (e.g. a small JSON file per project folder). Separately, this needs to be distinguished from known issue #1 below (stale navigation key), which could produce the *same symptom* even on the *same* phone across app restarts. **Next step:** on the same phone, after creating/using a project, fully close the app (swipe from recents) and reopen — if it drops back to Onboarding instead of showing the existing project, that's issue #1 firing, not a fresh-device artifact.
3. **Camera showed a black screen right after switching active project and renaming the box, but the saved PDF turned out to be a real photo, not black.** Not reproduced reliably — could be a camera-warmup/timing race right after a screen transition, could be specific to switching project + renaming box together, or could be a one-off. **Next step:** try to isolate — does it happen every time after switching projects (with no box rename)? Every time after any navigation back to Scanner, project-switch or not? Only the first photo after the app has been idle?
4. **Settings → "+ New Project" form fields aren't labeled clearly** — the two inline text inputs (project name, archive name) don't make it obvious what to type before you tap in. Fix: give them placeholder/example text the way Onboarding's equivalent fields already have (e.g. `"Title"` and `"Archive name"`), in `SettingsScreen.js`'s `newFormInput` fields.
5. **Cosmetic issue with the OMG button** — reported without specifics. Get a screenshot or exact description next session before acting on this.

## Known issues (carried over from earlier code review, still unverified)

1. **`AppNavigator.js` decides whether to skip onboarding using the old single-project key (`StorageService.loadProject()`/`project_state`), but Onboarding and Settings now only write to the newer `projects_list`/`active_project_id` keys.** Any project created since the multi-project refactor is invisible to the navigator on a cold app start, which would bounce her back to Onboarding and could create a duplicate Drive folder. Directly relevant to field-testing note #2 above. Not yet fixed — needs `AppNavigator.js` to call `StorageService.migrateProjectIfNeeded()` + `getActiveProject()` instead of `loadProject()`.
2. **`UploadQueueService.processQueue(folderId)` uploads every queued item to whichever project is currently active, ignoring the `folderId` stored on each individual queued item.** Only matters if she has offline items queued and switches active projects before reconnecting — low risk today since she works one archive/project at a time, but worth fixing since multi-project switching exists in the UI.
3. `MarkupScreen.js`'s `buildPageResult()` re-encodes the full-resolution camera photo to base64 with no downscaling before embedding it in HTML for `expo-print`. Now a leading suspect for field-testing note #1 (blank/white pages) above, not just a theoretical performance concern.
4. `android` permission list includes `RECORD_AUDIO`, which nothing in the app uses — an unexplained permission prompt, cosmetic/trust issue only.

### Fixed 2026-07-04
- Removed all AI/Anthropic code (`AnthropicService.js` deleted, `Config.js` no longer has an Anthropic key — it was a placeholder anyway and never actually wired up to any screen). Onboarding never called it in practice; the "AI-generated tags" feature described in old docs was already dead code.
- Registered `TagVocabularyScreen` in `AppNavigator.js` — it existed and was linked from Settings ("Edit Tag Vocabulary") but was never added to the navigator, so tapping that row would have crashed.
- Onboarding now routes to the Create Tags screen (with a skip button) instead of AI tag generation.
- Implemented the unmarked-backup-page safeguard in `ConfirmationScreen.js` (commit `5541d63`) — **not yet tested on a device**, see "Important" note above.
- Fixed the Google Sign-In `DEVELOPER_ERROR` by correcting the SHA-1 fingerprint on the Android OAuth client in Google Cloud Console (config-only fix, no code changed).

## Start here next session

1. Rebuild (`eas build -p android --profile preview`) and reinstall (`adb install -r`) so the phone actually has the backup-page safeguard and other recent commits — don't test or judge that feature on the currently-installed build.
2. Add an explicit photo resize/downscale step in `MarkupScreen.js`'s `buildPageResult()` before base64-encoding, and retest the blank/white-page issue with a deliberately large photo. This is the top suspect for the "biggest problem" reported.
3. Fix `AppNavigator.js`'s stale project-key check (known issue #1) — cheap, and directly relevant to the "old projects don't show up" report.
4. Add placeholder text to the Settings "+ New Project" form fields.
5. Try to reproduce the black-screen-after-project-switch issue with the isolation steps above.
6. Get a screenshot/description of the OMG button cosmetic issue before doing anything about it.

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
