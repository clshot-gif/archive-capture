# Archive Capture — Project Reference

Read this first, before exploring the codebase. It exists so a future session (or a future you) doesn't have to re-derive what's already known. Keep it updated when things change materially — stale docs cost more than no docs.

## Who this is for

Built for a solo, non-technical researcher (Carter's wife) who carries her phone into physical archives and photographs documents. Carter is not a developer — he needs plain-language explanations of git/build/deploy steps, and wants proactive help avoiding secret leaks (API keys, OAuth credentials) since he doesn't have habits built around that yet.

## What the app does

She photographs documents one at a time. Each photo becomes a single- or multi-page PDF with pen/highlighter markup baked in, tagged and saved to a Google Drive folder structure (`Archive Capture — <Collection name> / Box X / Folder Y / ...`), fully offline-capable and syncing when connectivity returns. A separate "Phase 2" system (not yet built — see `archive-capture-context-for-phase2.md` in the parent folder) will later read this corpus and do the heavier organizing/analysis work; `docs/metadata-schema.md` documents exactly what metadata is attached to each PDF today, for that future conversation to work from.

**There is no "Project" concept anywhere in the UI.** Every scan belongs to a **Collection** (required — the umbrella name for what she's building, e.g. "Good Poems") and optionally an **Archive Name** (where the physical documents actually live/came from, e.g. "Five Forks"). Internal code still uses `project.name`/`project.archiveName` as the underlying field names (harmless, not user-facing) — don't let that internal naming pull you back toward calling anything "Project" in labels, alerts, or screen text.

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

- **Onboarding** — Google Sign-In → Collection name + optional Archive Name → Drive folder created → Create Tags step (skippable) → Scanner. Only fires on the very first-ever sign-in on a device — every subsequent collection is created via Settings, which does **not** route through a tag-creation screen (see below).
- **Scanner** — top banner shows `Collection - Archive Name` (or just Collection if no Archive Name), tappable to Settings, plus a **Drive ›** link that opens that collection's Drive folder directly. Below that: a "take multiple photos before marking up" toggle (batch-capture mode — see below), the camera capture button, then larger Box/Folder text fields positioned under the button (the whole screen is wrapped in `KeyboardAvoidingView` so these fields slide up above the keyboard instead of being hidden). Settings gear icon bottom-right of the banner. Camera closes automatically on navigating away, to avoid resuming a stale preview surface.
  - **Batch-capture mode**: toggle on, tap the shutter repeatedly — the camera stays open shot after shot instead of jumping to Markup each time. A **Done** button appears once ≥1 photo is queued; tapping it hands everything to Markup, where only the *last* photo is markable (OMG/pen/highlighter/comment) — earlier photos in the batch ride along unmarked, same mechanism as the existing "Keep Scanning" multi-page flow. Shared photo-processing logic lives in `src/utils/pageBuilder.js` (`buildPlainPageResult`), used by both this batch path and Markup's own per-page build.
- **Markup** — pen + highlighter with undo, real pinch-to-zoom + two-finger pan (via gesture-handler), OMG flag (always-visible label, greyed out when off / red-white when on), typed comment, "Keep Scanning" for multi-page documents. Drawing coordinates are computed against the actual visible image rectangle (accounting for letterboxing), not the raw canvas box, so marks land in the same place on-screen and in the exported PDF.
- **Confirmation** — tag checklist (add new tag inline, delete any current-collection tag via ✕, pull in tags from any other collection via the **Previous Tags** button), Done → PDF saved locally, always queued for background Drive upload, filename built as `Collection - Archive Name - Box - Folder - Number[ - OMG].pdf` (any missing field is skipped, not left as an empty placeholder). This is the *only* tags UI most collections ever get, since new collections made via Settings skip the onboarding tag screen.
- **Settings** — switch between collections (section is titled "Collections"; "+ New Collection" form asks for "Collection Name" and "Archive Name (optional)" — fixed a real bug where this form used to mislabel the Archive Name field as "Collection (optional)"), reconnect Google Drive, edit tag vocabulary. `KeyboardAvoidingView`-wrapped so the new-collection fields aren't hidden by the keyboard.
- **Tag Vocabulary** — add/rename/delete tags for the active collection, plus its own **Previous Tags** button (same picker component as Confirmation). Reached from Settings, or once from Onboarding.

Multi-page documents, multi-collection support, nested Drive folders, per-folder file numbering, per-collection tags with a cross-collection "Previous Tags" pool, batch photo capture, and offline queueing are all implemented and working — don't assume they still need building.

## Status as of 2026-07-05 — handed off, in active use, second round of polish shipped

The app has been handed off — she's signed in on her own phone, created her own Collection, and is actively using it happily. Every bug from the 2026-07-04/05 field-testing sessions was fixed (see "Fixed this round" below), then a second same-day round added batch capture, fixed several UI issues she found in real use, and eliminated the confusing "Project" naming (see "Second round" below). All of it has shipped via `eas update` to the `preview` branch/channel and is live on both her phone and Carter's test phone.

Both `fix/blank-pages-and-navigator` (the first round) and `feature/naming-batch-capture-ui` (the second round, this update) have been merged into `master` — `master` is the current baseline. Start any new work from a fresh branch off `master`.

### Second round (later, same day) — batch capture, Collection/Archive Name rename, UI fixes

- **Batch photo capture** — a Scanner-screen toggle lets her take several photos in a row without leaving the camera each time; see the Scanner bullet above and `src/utils/pageBuilder.js`.
- **Filename convention changed** to `Collection - Archive Name - Box - Folder - Number[ - OMG].pdf` (was previously just `Box - Folder - Number[ OMG]`, then briefly `Archive Name - Project - Box - Folder - Number - OMG` before the Project→Collection rename below settled the final field order).
- **Eliminated "Project" from the UI entirely**, renaming to Collection (required) / Archive Name (optional) — including fixing a real mislabeling bug where Settings' "new collection" form displayed the Archive Name field as "Collection (optional)". See the "no Project concept" callout near the top of this file.
- **Scanner screen UI fixes from real-world use**: Box/Folder fields are bigger, moved under the camera button, and the whole screen is keyboard-avoiding so they don't get hidden while typing; the batch-mode toggle got real on/off contrast (`trackColor`/`thumbColor`) instead of looking like an inert dot; the Collection/Archive Name banner (which had visually disappeared under the status bar after an earlier edit removed the box/folder top bar that used to provide top clearance) is back with proper padding, plus a **Drive ›** shortcut link; the Settings gear icon was nudged down so it stops nearly overlapping that link.
- **`docs/metadata-schema.md` added** — documents the exact Drive `properties` object attached to every uploaded PDF (from `ConfirmationScreen.js`'s `handleDone`), field-by-field with types and examples. Written for a future conversation about building a metadata browsing/filtering UI (the "Phase 2" system) — read it before designing that UI rather than re-deriving the schema from the code.
- One transient glitch, not root-caused: while creating a fresh collection on her own phone, she briefly got a Drive "request access to a folder Carter owns" prompt with no code path that could explain it (no hardcoded folder IDs or sharing calls anywhere in the app). It resolved itself on retry and hasn't recurred. Worth watching for a repeat, not worth chasing further on a single occurrence.

### EAS Update workflow (new capability — use this before reaching for a full rebuild)

`eas.json`'s `preview` build profile now has `"channel": "preview"` wired to a same-named branch, and `app.config.js` was fixed so both `eas build` and `eas update` see the same config (previously a dev/prod detection bug meant `eas update` couldn't find the `updates` config at all).

**For any JS-only change** (screens, services, components, styling — anything that doesn't add a new native module, permission, or config-plugin change), ship it with:
```
npx eas-cli@latest update --branch preview --environment preview --message "..."
```
run from inside real WSL (not the Windows-side shell — there's a UNC-path bug in Windows `cmd.exe` that breaks `npx` when the working directory is a `\\wsl.localhost\...` path; use `wsl.exe -e bash -lc "cd ~/projects/... && npx ..."` if driving this from Windows). No `adb install` needed — already-installed builds check for updates on cold start and apply on the *next* full restart, so changes need the app **closed and reopened twice** to actually take effect (first reopen fetches, second runs it).

**Only do a full `eas build -p android --profile preview` + `adb install -r` when** a change touches native config: new native dependency, new Android permission, `app.config.js` plugin changes, `AndroidManifest.xml`-level changes, etc.

### Fixed first round (2026-07-04 → 2026-07-05)

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

## Handoff — done

She's installed, signed in, created her own Collection, and is actively scanning. Nothing left to do here. Kept for reference in case the app ever needs to go on a *new* device (hers or someone else's) again:

1. **Add the Google account as an OAuth test user (Carter must do this — not something Claude can do).** This app's Google Cloud project is unverified/in "Testing" publishing status, which restricts sign-in to an explicit allowlist regardless of who has the APK. Go to Google Cloud Console → project `526107030062` → APIs & Services → OAuth consent screen → Test users → **Add users** → enter the Gmail address → Save. Without this, sign-in fails even with a working install.
   - Expect an "unverified app" warning screen the first time anyone signs in on a new account (normal for a personal app that hasn't gone through Google's verification review) — tap "Advanced" → "Go to Archive Capture (unsafe)" once. Not a bug.
2. **Get the APK onto the device.** No Play Store — direct install. The install link used for this round was tied to EAS build `7def09ee-50f1-4b77-8a9c-14d9f1a7eb4f` (built 2026-07-05) and expires ~30 days after building — if it's needed again later, re-run `eas build -p android --profile preview` first to get a fresh link, then send that.

A fresh install always picks up everything published to the `preview` branch since it embeds the current channel and fetches anything newer on first launch.

No per-user Drive setup needed beyond the OAuth test-user step above — Drive access is scoped to files/folders each account creates itself (`drive.file` scope), so scans always land in that signed-in account's own Drive, under their own new "Archive Capture — ..." folder.

## Next planned work — camera screen redesign (not started)

Carter wants to cut down on taps during a scanning session, especially for "just flying through" a stack of documents. The plan: redesign `ScannerScreen.js` so the camera preview is **always live and full-bleed**, the same way `MarkupScreen.js` is always showing its photo full-bleed with a dark background and overlay toolbars — instead of today's two-state design where the main screen shows a big blue "Tap to Scan" button and a *separate* full-screen camera view only appears after tapping it (`showCamera` boolean toggling between two completely different layouts).

Target flow: land on Scanner → camera is already live behind everything → tap a capture control → photo is taken immediately (no intermediate "open camera" tap) → either stays in live-camera view for the next shot (batch mode) or goes straight to Markup (normal mode). Very little thumb movement required per photo.

This touches more than just the shutter button — everything that currently lives on the *pre-camera* Scanner screen (Collection/Archive Name banner + Drive link, batch-mode toggle, Box/Folder fields, settings gear, queue/page banners) needs a new home as an overlay on top of a permanently-live camera feed, the way Markup overlays its toolbar and action buttons on top of the photo. Worth treating as its own focused redesign rather than an incremental patch — a good candidate for a fresh chat/branch off `master`.

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
- `master` is the current baseline — both prior rounds (`fix/blank-pages-and-navigator`, `feature/naming-batch-capture-ui`) have been merged into it. Branch off `master` for the next round of work.
- **Windows/WSL git gotcha worth knowing**: running `git` against this repo through its `\\wsl.localhost\...` UNC path (e.g. from a Windows-side shell) can hit a "detected dubious ownership" error the first time — fixed permanently with `git config --global --add safe.directory '%(prefix)///wsl.localhost/ubuntu/home/carter/projects/Organizer_Archives/archive-capture'` (a one-time trust setting, not a behavior change). Separately, `git log`/`git merge` without an explicit `-m`/`--no-edit` can hang indefinitely waiting on a pager or commit-message editor that has no terminal to talk to in this environment — always pass `--no-edit` on merges and avoid bare `git log` (pipe through `--no-pager` or redirect to a file) to avoid a stuck process.

## Where things are

- App code: `archive-capture/` (this folder)
- Design/planning docs: `archive-capture-dev-handoff.md`, `archive-capture-context-for-phase2.md`, `Archive Capture.pdf`, `archive-app-claude-code-spec.docx` — all one level up in `Organizer_Archives/`
- `docs/metadata-schema.md` — the exact Drive `properties` metadata schema attached to every uploaded PDF; read before designing any future metadata browsing/filtering UI
- `src/config/Config.js` — Google Client ID (not secret) and the Drive folder naming prefix
- `src/services/DriveService.js` — all Drive API calls, including nested Box/Folder subfolder creation (`findOrCreateChildFolder`, `resolveDestinationFolder`)
- `src/services/StorageService.js` — all local AsyncStorage reads/writes, including per-scope file counters and per-collection + cross-collection tag storage
- `src/services/UploadQueueService.js` — offline queue processor (per-item folder resolution, no longer has the old "wrong active collection" bug)
- `src/components/PreviousTagsModal.js` — shared cross-collection tag picker, used by both Confirmation and Tag Vocabulary screens
- `src/utils/pageBuilder.js` — shared photo downscale/base64 step (`buildPlainPageResult`), used by Markup's per-page build and Scanner's batch-capture path
- `src/screens/ScannerScreen.js` — the file the next planned camera redesign (see above) will focus on
