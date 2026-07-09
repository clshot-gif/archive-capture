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
- **Scanner** — the camera preview is **always live** in a rounded box near the top (not full-bleed — just big enough to confirm framing/focus; shrinks further while the keyboard is open so it never covers Box/Folder). Top banner shows `Collection - Archive Name` (or just Collection if no Archive Name), tappable to Settings, plus a **Drive ›** link that opens that collection's Drive folder directly. Below the preview: larger Box/Folder text fields, a **GO MODE** toggle, and the shutter button — all pinned to a shared bottom offset (`src/constants/layout.js`'s `CONTROL_ROW_BOTTOM`/`CONTROL_ROW_HEIGHT`) so they line up with the equivalent row on Markup and Confirmation (see below). Settings gear is a separate floating button in the bottom-right corner (kept clear of the "waiting to sync" banner up top). Camera preview only renders while the screen is focused (`useIsFocused`), so navigating away and back never resumes a stale preview surface.
  - **GO MODE** (renamed from the old "take multiple photos" toggle): toggle on, tap the shutter repeatedly — stays on this screen shot after shot instead of jumping to Markup each time. Once ≥1 photo is queued, **Retake** (undoes only the most recent shot) and **Save** (finishes the batch now) buttons appear flanking the shutter. Turning GO MODE off mid-batch does **not** discard the queued photos — the next regular-mode shot automatically finishes the batch as its last, markable page, same as tapping Save directly would. Shared photo-processing logic lives in `src/utils/pageBuilder.js` (`buildPlainPageResult`), used by both this batch path and Markup's own per-page build.
- **Markup** — pen + highlighter with undo, real pinch-to-zoom + two-finger pan (via gesture-handler), OMG flag (always-visible label, greyed out when off / red-white when on), typed comment, "Keep Scanning" for multi-page documents. Drawing coordinates are computed against the actual visible image rectangle (accounting for letterboxing), not the raw canvas box, so marks land in the same place on-screen and in the exported PDF. The three action buttons (comment / keep scanning / save) are now icons (`@expo/vector-icons`: chat bubble, camera, Google Drive logo) floating over the full-bleed photo at the same pinned bottom offset as Scanner's shutter, instead of a text row at the very bottom. A **Retake** button (bottom-left, in the space that freed up) discards the current photo and returns to the live camera via `navigation.goBack()`.
- **Confirmation** — tag checklist (add new tag inline — with type-ahead autocomplete suggestions from the all-time tag pool, tap one to add instantly — delete any current-collection tag via ✕ with a confirmation prompt, pull in tags from any other collection via the **Previous Tags** button), Done → PDF saved locally, always queued for background Drive upload, filename built as `Archive <name> - Collection <name> - Box <n> - Folder <n> - Number[ - OMG].pdf` (any missing field is skipped, not left as an empty placeholder; every field is labeled with what it is — Archive/Collection unlabeled was the ambiguity bug from a previous version). Done button is pinned to the same shared bottom offset as Scanner/Markup. This is the *only* tags UI most collections ever get, since new collections made via Settings skip the onboarding tag screen.
- **Settings** — switch between collections (section is titled "Collections"; "+ New Collection" form asks for "Collection Name" and "Archive Name (optional)" — fixed a real bug where this form used to mislabel the Archive Name field as "Collection (optional)"), reconnect Google Drive, edit tag vocabulary. `KeyboardAvoidingView`-wrapped so the new-collection fields aren't hidden by the keyboard.
- **Tag Vocabulary** — add/rename/delete tags for the active collection (delete now confirms first), type-ahead autocomplete on the new-tag input (same as Confirmation), plus its own **Previous Tags** button (same picker component as Confirmation, whose own pool-prune ✕ also now confirms before deleting). Reached from Settings, or once from Onboarding.

Multi-page documents, multi-collection support, nested Drive folders, per-folder file numbering, per-collection tags with a cross-collection "Previous Tags" pool, batch photo capture, and offline queueing are all implemented and working — don't assume they still need building.

## Status as of 2026-07-06 — live-camera Scanner redesign shipped, tag UX polish, GitHub connected

The app has been handed off — she's signed in on her own phone, created her own Collection, and is actively using it happily. Every bug from the 2026-07-04/05 field-testing sessions was fixed, then a second same-day round added batch capture and eliminated the "Project" naming, then this third round (2026-07-06) delivered the previously-planned camera screen redesign plus a batch of real-use feedback fixes. All of it has shipped via `eas update` to the `preview` branch/channel and is live on both her phone and Carter's test phone.

`fix/blank-pages-and-navigator` and `feature/naming-batch-capture-ui` (rounds one and two) are merged into `master`. **This round's work is on `feature/live-camera-scanner`, pushed to GitHub but not yet merged into `master`** — merge once she's confirmed it's solid in real use for a few days.

### Third round (2026-07-06) — live-camera Scanner redesign, GO MODE, icon buttons, tag UX

This was the "next planned work" camera redesign flagged in the previous round, done as its own branch per that note. Delivered in three passes as she tested on-device between each:

1. **Scanner rebuilt around an always-live camera preview** (not full-bleed — a rounded box sized to confirm framing/focus) instead of the old two-state "Tap to Scan → separate full-screen camera" design. Permission is requested on mount instead of on first tap. The old "take multiple photos" toggle is renamed **GO MODE**.
2. **Shared ergonomic control-row alignment** — Scanner's shutter, Markup's three action icons, and Confirmation's Done button are all pinned to the same distance from the screen's bottom edge (`src/constants/layout.js`), found by feel to sit lower than a first-draft mid-screen placement but higher than flush-bottom (like a native camera app). If this needs nudging, it's one constant (`CONTROL_ROW_BOTTOM`) shared by all three screens.
3. **Markup's action row is now icons** (`@expo/vector-icons`: chat-bubble for comment, camera for keep-scanning, Google Drive logo for save) floating over the full-bleed photo, plus a new **Retake** button (bottom-left) that discards the current photo and goes back to the live camera.
4. **GO MODE semantics fixed after first real use**: the discard button was clearing the *entire* batch, which felt wrong — renamed to **Retake** and now undoes only the most recent photo. Toggling GO MODE off mid-batch no longer discards queued photos; the next regular-mode shot finishes that batch as its final markable page (same code path as tapping the batch button directly, which was renamed **Save** to stop the two-different-meanings-of-"Done" confusion between finishing the photos vs. finishing GO MODE).
5. **Keyboard covering Box/Folder fixed** — the preview box now shrinks to a small strip while the keyboard is open (cosmetic only; the crop aspect used for the actual saved photo is unaffected) so the fields stay visible above it.
6. **Settings gear relocated** to the Scanner screen's bottom-right corner — it used to sit near the top and could get covered by the "waiting to sync" banner.
7. **Tag management UX**: deleting a tag (per-collection, or from the cross-collection all-time pool via Previous Tags) now confirms first. Typing a new tag shows type-ahead suggestions from the all-time pool (`src/hooks/useTagAutocomplete.js`) — tap one to add it instantly instead of typing it out or hunting through Previous Tags.
8. **The "marked up, original elsewhere" PDF banner text was enlarged** — the concern was someone not noticing it existed at all, which matters more than it covering a bit more of an already-marked-up photo.
9. Added `@expo/vector-icons` as a new dependency (JS/font-asset only, no native rebuild needed — ships fine via `eas update`).

Known compromise: the "save" icon uses the monochrome font-glyph version of the Google Drive logo (`MaterialCommunityIcons` "google-drive"), not the actual multi-color triangle logo — flagged to Carter as a possible follow-up if it bothers her in practice.

### Fourth round (2026-07-07 → 2026-07-08) — filename convention fix, then a real production incident it caused

`buildFileBaseName` in `ConfirmationScreen.js` initially had two problems: Collection and Archive Name were pushed into the filename as bare sanitized strings in the wrong order (Collection first, should be Archive Name first). First fix attempt swapped the order and added `Archive `/`Collection ` labels to match Box/Folder's style — **this labeling was wrong per follow-up feedback and was reverted**; the actual wanted convention has no label words on any field, just bare values in order:

`Archive - Collection - Box - Folder - Number[ - OMG].pdf`

**The labeled version caused a real incident** while briefly live: Hannah's uploads started silently, permanently failing — folders kept being created fine (a separate, short-named Drive call), but files never uploaded, with tens of files stuck in "waiting to sync" with no visible error, because the upload queue swallowed errors via `console.warn` + `continue`. Root cause, confirmed 2026-07-08: her Collection name was long, and adding the `Archive `/`Collection ` label words was enough extra length to break the upload — but the *real* constraint turned out to be the filename itself (used for the local file path, and as Drive's own `name` field on the create call), not just the `properties.temp_filename` copy of it. A first attempted fix (truncating only the `properties` values in `DriveService.js`'s `flattenMetadata`) did **not** resolve it, because it left the actual filename — the thing used for the local path and Drive's `name` field — uncapped. The real fix, now in `buildFileBaseName` itself: cap the combined filename at 100 characters at the source, so every downstream use of it (local path, Drive `name`, and the `properties.temp_filename` copy) is already safe. Confirmed resolved once shipped.

Two lasting improvements from chasing this: `DriveService.js` now includes the actual Drive error response body in thrown errors (not just the bare HTTP status), and the Scanner screen's "waiting to sync" banner is now tappable, showing the real error for any stuck queue item instead of nothing — worth checking there first if this class of bug ever recurs, rather than guessing blind again.

`docs/metadata-schema.md`'s example `temp_filename` updated to match the final (unlabeled) convention.

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

## Next planned work

**2026-07-09 — structural bug-fix phase handed off:** `../handoff-fable-structural-fixes.md`
has a ranked wishlist of cross-repo (archive-capture + review-ui) structural issues —
several are rooted here, including the Drive property-truncation vs. review-ui's
lossless-chunking mismatch (a live silent-data-loss path), the 5MB simple-upload
ceiling in `DriveService.js`, and the upload queue's `console.warn` + `continue` error
swallowing. Start from **this branch** (`feature/live-camera-scanner`, currently
`3bba200`) — it has every real, shipped fix referenced in the wishlist (filename cap,
queue error surfacing). Do **not** touch or merge `fix/pixel7a-blank-pages`: it is
this exact branch plus exactly one more commit (the pixel7a blank-page fix itself),
kept separate on purpose because that one commit is awaiting Hannah's on-device
confirmation before Carter merges it — nothing else on it is at risk, but it's not
yours to decide on.

Otherwise, nothing else specific queued right now. Natural next steps once the current branch settles: merge `feature/live-camera-scanner` into `master` after a few days of real use, decide whether the monochrome Google Drive save-icon (see round three, above) needs upgrading to the real logo asset, and revisit the `CONTROL_ROW_BOTTOM` constant if the shared control-row height ever feels off on her actual phone.

## Secret hygiene — read this before touching git

Carter doesn't have established git habits, so default to caution:
- **Never commit `Config.js` with a real secret value.** The Google Web Client ID in there is *not* secret (it's a public OAuth client identifier, safe to ship in an app) — but if any real API key is ever added to this file, don't commit it; use an untracked local file or environment variable instead.
- **The Google OAuth `client_secret_*.json` file has been moved to `~/secrets/` in real WSL** (outside `Organizer_Archives` entirely, so it can never end up inside a repo — it used to live loose in the parent `Organizer_Archives` folder, which wasn't a repo itself but was one accidental `git init` away from becoming a problem). It was a one-time download from Google Cloud Console; there's no ongoing need for the app to read it at runtime, so it doesn't need to be near the code at all.
- `.gitignore` still has a safety net for `client_secret*.json`, `*credentials*.json`, `*service-account*.json`, and `.env` — so even if one of these lands in this folder by accident, git won't pick it up. Still don't rely on that as the only safeguard.
- Before ever running `git add .` or pushing anywhere, run `git status` first and read the list — don't add blindly.

## Git basics for this project (plain language)

- `git status` — shows what's changed since the last commit. Safe to run anytime, changes nothing.
- `git diff` — shows the actual line-by-line changes not yet committed. Safe, read-only.
- `git add <file>` then `git commit -m "message"` — saves a checkpoint. Use specific filenames, not `git add .`, so you don't accidentally include something you didn't mean to.
- **GitHub is connected as of 2026-07-06** — remote `origin` is `https://github.com/clshot-gif/archive-capture.git`. `master` and `feature/live-camera-scanner` are both pushed. Push happens through Windows Git's Credential Manager (not the `gh` CLI, which isn't installed — WSL `sudo` needs an interactive password Claude can't supply, so installing it needs Carter to run one command himself if it's ever wanted).
- Building for the phone is a separate step from git — `eas build -p android --profile preview` (via EAS Build, cloud-based) builds an installable APK from whatever is in this folder right now, committed or not. For most changes now, `eas update` (see above) is faster and doesn't need a rebuild or reinstall at all.
- `master` is the current baseline — the first two rounds (`fix/blank-pages-and-navigator`, `feature/naming-batch-capture-ui`) are merged into it. `feature/live-camera-scanner` (this round) is pushed but not yet merged — see "Status" above.
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
- `src/hooks/useTagAutocomplete.js` — type-ahead tag suggestions from the all-time tag pool, used by Confirmation and Tag Vocabulary's new-tag inputs
- `src/constants/layout.js` — the shared `CONTROL_ROW_BOTTOM`/`CONTROL_ROW_HEIGHT` that keep Scanner's shutter, Markup's action icons, and Confirmation's Done button aligned to the same ergonomic height
- `src/screens/ScannerScreen.js` — always-live camera preview, GO MODE batch capture, Box/Folder fields
