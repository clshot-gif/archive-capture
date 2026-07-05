# Archive Capture — Project Reference

Read this first, before exploring the codebase. It exists so a future session (or a future you) doesn't have to re-derive what's already known. Keep it updated when things change materially — stale docs cost more than no docs.

## Who this is for

Built for a solo, non-technical researcher (Carter's wife) who carries her phone into physical archives and photographs documents. Carter is not a developer — he needs plain-language explanations of git/build/deploy steps, and wants proactive help avoiding secret leaks (API keys, OAuth credentials) since he doesn't have habits built around that yet.

## What the app does

She photographs documents one at a time. Each photo becomes a single- or multi-page PDF with pen/highlighter markup baked in, tagged and saved to a Google Drive folder structure (`Archive Capture — Project / Box X / Folder Y / ...`), fully offline-capable and syncing when connectivity returns. A separate "Phase 2" system (not yet built — see `archive-capture-context-for-phase2.md` in the parent folder) will later read this corpus and do the heavier organizing/analysis work.

## Tech stack

- React Native + Expo SDK 55 (managed workflow), React Native 0.83, React 19
- `@react-native-google-signin/google-signin` — native Google OAuth
- Google Drive REST API directly (no SDK) — nested folder creation (Box/Folder subfolders), two-step PDF upload, custom file properties for metadata
- `expo-camera`, `expo-image-manipulator`, `expo-print` (HTML → PDF), `react-native-svg` (markup overlay)
- `react-native-gesture-handler` — real cross-platform pinch/pan zoom on the Markup screen (RN's `ScrollView` zoom is iOS-only, doesn't work on Android)
- `@react-native-async-storage/async-storage` for all local state (projects, tags, queue, box/folder, per-scope file counters)
- `@react-native-community/netinfo` + a local AsyncStorage queue for offline-first upload
- `expo-updates` + EAS Update — most JS-only changes now ship as an over-the-air update instead of a full native rebuild (see "EAS Update workflow" below)
- No AI/LLM involvement anywhere in this app (removed 2026-07-04)

## Screens and current features

- **Onboarding** — Google Sign-In → project name + optional archive name (called "Collection" in the UI) → Drive folder created → Create Tags step (skippable) → Scanner. Only fires on the very first-ever sign-in on a device — every subsequent project is created via Settings, which does **not** route through a tag-creation screen (see below).
- **Scanner** — persistent box/folder text fields (explicit text/placeholder colors so they're never washed out), one-tap camera (captures cropped to match the on-screen preview's aspect ratio), active-project banner, offline-queue count banner. Camera closes automatically on navigating away, to avoid resuming a stale preview surface.
- **Markup** — pen + highlighter with undo, real pinch-to-zoom + two-finger pan (via gesture-handler), OMG flag (always-visible label, greyed out when off / red-white when on), typed comment, "Keep Scanning" for multi-page documents. Drawing coordinates are computed against the actual visible image rectangle (accounting for letterboxing), not the raw canvas box, so marks land in the same place on-screen and in the exported PDF.
- **Confirmation** — tag checklist (add new tag inline, delete any current-project tag via ✕, pull in tags from any other project via the **Previous Tags** button), Done → PDF saved locally, always queued for background Drive upload. This is the *only* tags UI most projects ever get, since new projects made via Settings skip the onboarding tag screen.
- **Settings** — switch between projects (`KeyboardAvoidingView`-wrapped so the new-project fields aren't hidden by the keyboard), reconnect Google Drive, edit tag vocabulary.
- **Tag Vocabulary** — add/rename/delete tags for the active project, plus its own **Previous Tags** button (same picker component as Confirmation). Reached from Settings, or once from Onboarding.

Multi-page documents, multi-project support, nested Drive folders, per-folder file numbering, per-project tags with a cross-project "Previous Tags" pool, and offline queueing are all implemented and working — don't assume they still need building.

## Status as of 2026-07-05 — field-testing round complete, ready to hand off

Every bug surfaced during the 2026-07-04/05 field-testing sessions has been fixed and confirmed working by Carter on the Pixel 10a test phone (see "Fixed this round" below). The app is in a genuinely usable state. What's left is **distribution to her phone**, not further bug-fixing — see "Handing this off to her" below for the concrete remaining steps.

### EAS Update workflow (new capability — use this before reaching for a full rebuild)

`eas.json`'s `preview` build profile now has `"channel": "preview"` wired to a same-named branch, and `app.config.js` was fixed so both `eas build` and `eas update` see the same config (previously a dev/prod detection bug meant `eas update` couldn't find the `updates` config at all).

**For any JS-only change** (screens, services, components, styling — anything that doesn't add a new native module, permission, or config-plugin change), ship it with:
```
npx eas-cli@latest update --branch preview --environment preview --message "..."
```
run from inside real WSL (not the Windows-side shell — there's a UNC-path bug in Windows `cmd.exe` that breaks `npx` when the working directory is a `\\wsl.localhost\...` path; use `wsl.exe -e bash -lc "cd ~/projects/... && npx ..."` if driving this from Windows). No `adb install` needed — already-installed builds check for updates on cold start and apply on the *next* full restart, so changes need the app **closed and reopened twice** to actually take effect (first reopen fetches, second runs it).

**Only do a full `eas build -p android --profile preview` + `adb install -r` when** a change touches native config: new native dependency, new Android permission, `app.config.js` plugin changes, `AndroidManifest.xml`-level changes, etc.

### Fixed this round (2026-07-04 → 2026-07-05)

- Blank/white pages — full-res camera photos were hitting a size limit in `expo-print`'s WebView. Fixed with an explicit resize to 1600px wide before base64-encoding (`MarkupScreen.js`).
- Stale project-key bug — `AppNavigator.js` now calls `migrateProjectIfNeeded()` + `getActiveProject()` instead of the old single-project `loadProject()`, so projects don't vanish on cold start.
- Upload queue bug — `UploadQueueService.processQueue()` now resolves each queued item's own Drive destination from its own stored `folderId`/box/folder, instead of uploading everything to whichever project happens to be active.
- Camera capturing more than the on-screen preview showed — the preview crops to fill the screen ("cover"), but the saved photo was the full uncropped sensor image. Now center-cropped to match the preview's aspect ratio (`ScannerScreen.js`).
- PDF only showing roughly the top half of a photo — the print HTML was fitting a portrait photo into a print-paper-shaped page via `vh`/percentage-height flexbox, which hit a webview flex-height edge case. Fixed by sizing the actual PDF page to match the photo's aspect ratio instead (`ConfirmationScreen.js`).
- Pinch-to-zoom never worked on Android — RN's `ScrollView` zoom (`maximumZoomScale`) is iOS-only. Replaced with a real cross-platform implementation using `react-native-gesture-handler` (already a transitive dependency, no new native install needed).
- Markup strokes landing in the wrong place (pulled toward center) — drawing coordinates were based on the full canvas box, not the actual visible image rectangle within it (which is smaller than the box due to `resizeMode="contain"` letterboxing whenever the box's aspect ratio doesn't exactly match the photo's). Now computed against the real image content rect, so on-screen and exported-PDF coordinates agree.
- Black screen after switching projects — camera now closes automatically on navigating away from Scanner (`blur` listener), so returning never resumes a possibly-stale native camera surface.
- Washed-out/near-invisible field text — every `TextInput` in the app now sets explicit text and placeholder colors instead of relying on platform/theme defaults.
- Settings "+ New Project" fields covered by keyboard — wrapped in `KeyboardAvoidingView`.
- File naming — Drive files now nest as `Archive Capture — Project / Box X / Folder Y / Box X Folder Y 000001[ OMG].pdf`, and the counter restarts at 1 per distinct project+box+folder combination (persisted in AsyncStorage, so it survives app/phone restarts — it only resets when the box/folder text itself is new).
- Tags — now scoped per project (a new project starts empty) instead of one global list shared by everything. A separate cross-project "ever used" pool feeds a **Previous Tags** picker (multi-select import, plus a prune-from-pool ✕) on both the Confirmation screen and Tag Vocabulary screen. Each project's own tag list also has a per-tag ✕ to delete a mistyped or stale tag directly.

### Open / not yet addressed

1. `android` permission list includes `RECORD_AUDIO`, which nothing in the app uses — an unexplained permission prompt, cosmetic/trust issue only. Cheap fix: remove from `app.config.js`'s `android.permissions` — but this is a native-config change, needs a full rebuild, not an `eas update`.
2. The "cosmetic issue with the OMG button" mentioned in the first field-testing round (2026-07-04, no details given) was never confirmed independently — it may have been resolved incidentally by the OMG button redesign (always-visible "OMG" label, greyed vs. red/white) done during this round, or it may still exist. Ask if it's still visible before assuming it's fixed.
3. One report of a single page rendering way-zoomed-in and in landscape despite being shot in portrait, on the same page a few times, then not reproducing again after leaving and returning. Not root-caused — looked like a transient camera-session glitch rather than something in app code. Watch for a reproducible pattern before spending effort on it.
4. Product question, not a bug: a lost/reset/reinstalled phone currently loses all local project/tag/box-folder setup (AsyncStorage is per-device, not cloud-synced) even though the actual scanned documents are always safe in Drive. Worth a future conversation about whether to back up project/tag config into Drive too.

## Handing this off to her — what's actually left

The app itself is done for this round. Getting it onto her phone needs two things outside the codebase, both one-time:

1. **Add her Google account as an OAuth test user (Carter must do this — not something Claude can do).** This app's Google Cloud project is unverified/in "Testing" publishing status, which restricts sign-in to an explicit allowlist regardless of who has the APK. Go to Google Cloud Console → project `526107030062` → APIs & Services → OAuth consent screen → Test users → **Add users** → enter her Gmail address → Save. Without this, her sign-in will fail even with a working install.
   - Expect an "unverified app" warning screen the first time she signs in (normal for a personal app that hasn't gone through Google's verification review) — she'll need to tap "Advanced" → "Go to Archive Capture (unsafe)" once. Not a bug, just what unverified OAuth apps look like.
2. **Get the APK onto her phone.** No Play Store involved — it's a direct install. The current build's install link (works in any browser, no Expo login needed):
   `https://expo.dev/artifacts/eas/zbUhKoQsq-nkrev_hSk3dffsk8rMli2hWjCFhNHqAvk.apk`
   Send her that link (text/email/however) to open on her own phone — it downloads and Android will prompt to install (she'll need to allow "install unknown apps" for whichever app she opens it with, one-time). This link is tied to EAS build `7def09ee-50f1-4b77-8a9c-14d9f1a7eb4f` and expires roughly 30 days after it was built (created 2026-07-05) — fine for "next week," but if this ever needs to be re-sent much later, re-run `eas build -p android --profile preview` first to get a fresh link.

After that, her phone will behave like Carter's test phone: sign in, create her own project (Onboarding, since it's her first time), and every JS-only fix published since this build (all of the "Fixed this round" list above) will already be part of what she installs — no extra step needed, since the build embeds the current channel and will fetch anything published after it too.

She does **not** need to be added to anything else — Drive access is scoped to files/folders her own account creates (`drive.file` scope), so her scans land in her own Drive, under her own new "Archive Capture — ..." folder, same as Carter's.

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
- Building for the phone is a separate step from git — `eas build -p android --profile preview` (via EAS Build, cloud-based) builds an installable APK from whatever is in this folder right now, committed or not. For most changes now, `eas update` (see above) is faster and doesn't need a rebuild or reinstall at all.
- This round of work happened on branch `fix/blank-pages-and-navigator` — merge it into `master` once you're ready to consider it the new baseline.

## Where things are

- App code: `archive-capture/` (this folder)
- Design/planning docs: `archive-capture-dev-handoff.md`, `archive-capture-context-for-phase2.md`, `Archive Capture.pdf`, `archive-app-claude-code-spec.docx` — all one level up in `Organizer_Archives/`
- `src/config/Config.js` — Google Client ID (not secret) and the Drive folder naming prefix
- `src/services/DriveService.js` — all Drive API calls, including nested Box/Folder subfolder creation (`findOrCreateChildFolder`, `resolveDestinationFolder`)
- `src/services/StorageService.js` — all local AsyncStorage reads/writes, including per-scope file counters and per-project + cross-project tag storage
- `src/services/UploadQueueService.js` — offline queue processor (per-item folder resolution, no longer has the old "wrong active project" bug)
- `src/components/PreviousTagsModal.js` — shared cross-project tag picker, used by both Confirmation and Tag Vocabulary screens
