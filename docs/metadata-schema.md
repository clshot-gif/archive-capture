# Metadata attached to each scanned PDF

Every PDF this app uploads gets a set of custom key/value strings attached via
Google Drive's file **`properties`** field (`DriveService.uploadPDF` /
`updateFileMetadata` in [`src/services/DriveService.js`](../src/services/DriveService.js)).
This is *not* stored inside the PDF itself — it's Drive-level metadata on the
file object, readable via the Drive API (`files.get` with
`fields=properties`) or the Drive UI's file details panel.

The object is built once per saved document in
[`ConfirmationScreen.js`](../src/screens/ConfirmationScreen.js) (`handleDone`),
then flattened to all-string values before upload (Drive `properties` values
must be strings — anything else gets `JSON.stringify`'d).

## The two name fields

There's no "Project" concept in this app — every scan belongs to a
**Collection** (required, set at first sign-in or via "+ New Collection" in
Settings) and optionally an **Archive Name** (where the physical documents
actually live/came from, e.g. a specific archive or collection site). The
`collection` property holds the Collection value; `archive_name` holds the
Archive Name value. Both are set once when the collection is created and
don't change per-document.

## Fields

| Key | Type (conceptual) | Always present? | Example | Notes |
|---|---|---|---|---|
| `box` | string | yes (may be `''`) | `"3"` | Free text, not necessarily numeric |
| `folder` | string | yes (may be `''`) | `"2"` | Free text |
| `tags` | array of strings | yes (may be `[]`) | `["Letters", "1940s"]` | **Not flattened to a string in code** — see caveat below |
| `important` | `"true"` \| `"false"` | yes | `"true"` | Whether any page was OMG-flagged |
| `is_comment` | `"false"` (always) | yes | `"false"` | Always false today — reserved, unused |
| `parent_id` | string | yes (always `''` today) | `""` | Reserved for a future doc-relationship feature, unused |
| `has_markup` | `"true"` \| `"false"` | yes | `"true"` | Whether any page has pen/highlighter marks |
| `collection` | string | yes (may be `''`) | `"Good Poems"` | The Collection name (required field) |
| `archive_name` | string | yes (may be `''`) | `"Five Forks"` | The Archive Name (optional field) |
| `captured_at` | ISO 8601 timestamp | yes | `"2026-07-05T22:14:03.912Z"` | Set at save time, not at photo-capture time |
| `temp_filename` | string | yes | `"Five Forks - Good Poems - 3 - 2 - 000004 - OMG.pdf"` | The filename the PDF was uploaded as |
| `page_count` | string of an integer | yes | `"3"` | Number of photographed pages in this PDF |
| `omg_pages` | JSON array string (0-indexed) | yes | `"[2]"` | Which pages (by index) were OMG-flagged |
| `unmarked_backup_pages` | JSON array string (0-indexed) | yes | `"[0]"` | Which pages had markup — an unmarked duplicate of each such page is appended at the end of the PDF, and this lists which original-page indexes those backups correspond to |
| `typed_comments` | JSON array string of `{page, text}` | yes | `"[{\"page\":1,\"text\":\"Water damage on left edge\"}]"` | Typed comments, one entry per page that has one |

### Caveat: `tags`

`tags` is passed into `flattenMetadata` (in `DriveService.js`) as a raw JS
array, not a string. `flattenMetadata` does `JSON.stringify` any non-string
value, so in practice it round-trips fine as a `"[...]"` JSON string once
uploaded to Drive — but this is implicit behavior, not an explicit
`JSON.stringify(selectedTags)` in the code like the other array fields above.
Same practical shape, worth knowing it isn't written the same way.

## Example: full `properties` object for one uploaded PDF

```json
{
  "box": "3",
  "folder": "2",
  "tags": "[\"Letters\",\"1940s\"]",
  "important": "true",
  "is_comment": "false",
  "parent_id": "",
  "has_markup": "true",
  "collection": "Good Poems",
  "archive_name": "Five Forks",
  "captured_at": "2026-07-05T22:14:03.912Z",
  "temp_filename": "Five Forks - Good Poems - 3 - 2 - 000004 - OMG.pdf",
  "page_count": "3",
  "omg_pages": "[2]",
  "unmarked_backup_pages": "[0]",
  "typed_comments": "[{\"page\":1,\"text\":\"Water damage on left edge\"}]"
}
```

## Metadata that exists but isn't in `properties`

A UI for browsing/filtering these documents will likely also want standard
Drive file fields, available from the same `files.get`/`files.list` call
(`fields=id,name,parents,createdTime,webViewLink,properties`):

- `id` — the Drive file ID
- `name` — the actual filename on Drive (should match `temp_filename` above, barring a rename after upload)
- `parents` — the Drive folder ID it lives in (Box/Folder subfolder)
- `createdTime` — Drive's own upload timestamp (distinct from `captured_at`, which is client-set)
- `webViewLink` — a direct "open in Drive" URL for that file

## Constraints worth knowing for UI/filtering design

- Drive `properties` values are capped at **124 bytes each (UTF-8, key +
  value combined)**. Values that would exceed it are split losslessly across
  **continuation properties**: the first piece stays under the original key,
  the rest under `key~1`, `key~2`, … (e.g. `typed_comments`,
  `typed_comments~1`). Readers must reassemble by concatenating the
  contiguous run — both this app and review-ui do this via the shared
  `src/utils/driveProps.js` (kept byte-identical with
  `review-ui/src/lib/driveProps.js`; each repo's tests fail if the copies
  drift). Values that fit are stored unchanged, so most files look exactly
  like the example above. Historical note: before 2026-07-09 this app
  *truncated* oversized values with a trailing `…`, which could cut JSON
  fields mid-structure — review-ui salvages what it can from those and logs
  a warning when it meets one.
- Drive also caps a file at ~30 custom properties. `packProps` throws a
  descriptive error rather than exceed it (a file whose comment/tag history
  is that big needs a sidecar-document design — an open item, not built).
- `properties` are only queryable via Drive API field selection, not via
  Drive's full-text search — a metadata browser will need to fetch and filter
  client-side (or maintain its own index) rather than relying on Drive search
  syntax for structured fields like `box`/`folder`/`tags`.
