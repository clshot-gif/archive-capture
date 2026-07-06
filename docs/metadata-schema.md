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

## ⚠️ Naming quirk to know about

The `collection` property actually holds the **Project name** (the field
always required at setup), and `archive_name` holds the **Collection name**
(the optional field, labeled "Archive Name (optional)" on the sign-up screen
but referred to as "Collection" elsewhere in this project's docs/CLAUDE.md).
The keys are swapped relative to what their names suggest. This has been true
since the field was introduced, so every PDF ever uploaded uses this same
(backwards) mapping — a future metadata UI should account for it rather than
assume the key names are literal.

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
| `collection` | string | yes (may be `''`) | `"Good Poems"` | **Actually the Project name** — see naming quirk above |
| `archive_name` | string | yes (may be `''`) | `"Five Forks"` | **Actually the Collection/Archive name** — see naming quirk above |
| `captured_at` | ISO 8601 timestamp | yes | `"2026-07-05T22:14:03.912Z"` | Set at save time, not at photo-capture time |
| `temp_filename` | string | yes | `"Five Forks - Good Poems - Box 3 - Folder 2 - 000004 - OMG.pdf"` | The filename the PDF was uploaded as |
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
  "temp_filename": "Five Forks - Good Poems - Box 3 - Folder 2 - 000004 - OMG.pdf",
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

- Drive `properties` values are capped at ~124 bytes each — long typed
  comments or many tags could theoretically hit this, though nothing in the
  app currently truncates or warns about it.
- `properties` are only queryable via Drive API field selection, not via
  Drive's full-text search — a metadata browser will need to fetch and filter
  client-side (or maintain its own index) rather than relying on Drive search
  syntax for structured fields like `box`/`folder`/`tags`.
