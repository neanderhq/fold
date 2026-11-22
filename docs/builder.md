# Fold builder

See [development](development.md) and [testing](testing.md) for setup and verification.

## Build forms

Owners can add, edit, delete and move blocks with keyboard-accessible up/down controls. Every block has a stable UUID; moving or editing preserves it, deleting and adding creates a new one. Supported questions: short text (2,000 characters), long text (10,000), email (254), number (finite decimals with optional minimum/maximum), date (real YYYY-MM-DD calendar dates), single choice, multiple choice, dropdown, integer rating (1 through configurable 2–10), and boolean consent. Heading and description blocks do not accept answers. Question help text, form description, title and confirmation message are editable.

Forms support 1–50 blocks and must contain at least one question. Choice questions need 2–50 unique nonempty options, up to 200 characters each. Block labels, help text, form description and confirmation are capped at 2,000 characters; titles at 200. Request JSON is capped at 256 KiB, including the complete schema or answer object. Invalid IDs, unknown keys, duplicate block IDs, invalid field configuration, mismatched answer types, unlisted choices, duplicate selections and missing required answers are rejected server-side. Saving rejects invalid configurations; publishing validates again, including stored invalid configurations. Required consent must be true. Optional unanswered fields are stored as empty text, empty multi-selection or false consent.

Legacy `{title,question:{id,type:"short_text",label,required}}` JSON remains readable and submittable, including historical snapshots. New multi-block schemas use `{title,blocks:[{id,type,label,required,...}],description?,logoUrl?,confirmation?}`. Editing an old form in the builder may upgrade its draft to `blocks`; its live schema changes only upon republish. There is no bulk data rewrite.

### Settings and safe logos

Logo customization uses a trusted, externally hosted **HTTPS image URL**, not uploads. Credential-bearing URLs, non-HTTPS schemes and custom ports are rejected; the URL is at most 2,048 characters. The browser loads the image as an image with `referrerPolicy="no-referrer"`; Fold never fetches it on the server, stores files or exposes private sessions to an image proxy. Image hosts can still see visitors' IP addresses and request metadata, and external images may become unavailable. Choose a host you trust and have permission to use; no availability or tracking protection is promised. No external service is needed when the logo setting is blank.

The Live Split builder keeps compact question rows on the white left editing surface and a live public-renderer preview on the pale-blue right surface. Select a row to expand its settings inline; keyboard-accessible up/down buttons reorder the selected block. Logo and confirmation settings are immediately below the question list. The navy toolbar keeps status, Save draft and Publish/Republish accessible while scrolling. At narrow widths, Edit / Preview switches the single-column view without discarding unsaved edits or preview answers. Desktop and Mobile controls change the preview width.

Desktop/mobile draft previews share the actual form body and confirmation components with public forms. Test submissions run entirely in local React state, never call the submission API and never enter response counts. Preview reflects unsaved changes. Block configuration changes reset preview answers. Copy link and Copy embed code report success or a visible clipboard-error fallback with selectable text. Copying a link does not publish the form.

### Lifecycle and sharing

Save draft does not change the live form. Publish/republish copies a validated saved draft; unsaved changes must be saved first. Unpublish stops public reads and submissions. The dashboard provides rename (draft only), duplicate (new private draft, no responses), archive and restore. Archive unpublishes and retains all responses; restoring does **not** automatically republish. Existing links can be reused after explicitly publishing again.

Public links are `/f/:id`. The editor provides an iframe snippet with `width="100%"` and an adjustable height of 800px. Only the public form page allows framing (`frame-ancestors *`); all other pages and APIs use `frame-ancestors 'none'` and `X-Frame-Options: DENY`. No CORS exception, auth bypass or weakened private-write Origin check was added. Public iframe submissions work without an owner session. Public pages can be embedded by any site, so only publish content intended to be public. Browser local-network policies can block a remote page framing the localhost preview; the local browser suite grants its test embedding origin local-network permission, not an application permission or production bypass. Verify embedding against your own deployment before relying on it.

Archive, publish/unpublish and anonymous submission lock the same database form row. A submission serialized before archive/unpublish can succeed; one serialized after the state change cannot. Owners retain historical response snapshots and answers after question changes/deletion/reordering, republish, archive and restore.

## Response tools and private API

Every private route checks the actual Better Auth session and the owner's workspace. Mutations additionally require the configured exact trusted Origin and JSON. Responses cannot supply their own schema snapshot. Private editor/response pages independently enforce ownership. Nothing in the sample seed bypasses these checks.

The owner API exposes the following form and response operations:

| Route | Contract |
| --- | --- |
| `POST /api/forms/:id/rename` | `{title}`; updates draft title only |
| `POST /api/forms/:id/duplicate` | `{}`; returns a new unpublished draft, no responses |
| `POST /api/forms/:id/archive` | `{}`; marks archived and unpublishes atomically |
| `POST /api/forms/:id/restore` | `{}`; restores as unpublished |
| `GET /api/forms` | Includes `archived` and each form's `responseCount` |
| `GET /api/forms/:id/responses?page=1&q=...&from=YYYY-MM-DD&to=YYYY-MM-DD` | `{records,total,page,pageSize:20}`; stable descending timestamp/ID ordering |
| `GET /api/forms/:id/responses/:responseId` | Snapshot and typed answers for this exact owned form |
| `GET /api/forms/:id/export?q=...&from=...&to=...` | Owner-only spreadsheet-safe CSV attachment |

Search is case-insensitive literal substring matching over persisted answer/schema JSON, including original labels, titles and answers. `%`, `_` and backslashes are escaped, not wildcards. Date filters use inclusive calendar dates in **UTC**; reversed or invalid ranges return 400. List/detail UI uses saved snapshots, never current question labels. The unpaged legacy response API returns an array (up to 1,000 rows); new clients should always use pagination.

The response screen separately reads the existing unfiltered paginated total. Zero filtered results show **No matching responses** and **Clear filters** when submissions exist. **No responses yet** is reserved for a verified unfiltered total of zero. Filtered counts also show the overall total when different; search, date filters, original response details and CSV export retain their existing contracts.

CSV exports all matching pages, up to 10,000 responses per export. Above that, narrow the date range. CSV uses UTF-8 BOM, CRLF row separators and quoted cells with doubled embedded quotes, preserving newlines and commas. Formula-like prefixes (`=`, `+`, `-`, `@`, including leading whitespace/control characters) and leading tab/CR/LF get an apostrophe prefix. Headers include stable block IDs, and edited historical labels get distinct columns rather than being overwritten. Each row also records its snapshot form title. This deliberately represents numbers as safe quoted spreadsheet text where necessary. No desktop spreadsheet application was executed by the automated checks.

## Fictional template data

`pnpm db:seed` initializes fictional owner/form/response examples in an explicitly
new template database. Supply the deployment-generated `DEMO_PASSWORD`; never
reuse a delivery account. Repeated initialization preserves later user edits.
See the [development guide](development.md) for local environment loading and the
[testing guide](testing.md) for isolated runtime verification.
