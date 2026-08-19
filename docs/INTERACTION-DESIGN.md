# Interaction design

`media-list` should feel like editing a small personal list, not operating a dashboard. The service is intentionally ultra-light: SQLite is the live state, provider metadata is auxiliary, and normal list interaction must remain useful even when an external provider is slow, unavailable, or rate-limited.

## Structure

The library is the primary surface. Status tabs are its first-level navigation. Rows are the main objects and use one stable information hierarchy:

```text
cover + title
→ provider/year/original-title metadata
→ personal notes
→ focused list fields (status, score, progress, type, updated)
```

Title/metadata/notes stay together because they describe one position. Columns represent comparable list state. Status and score are direct controls and save on change; they must not require a second confirmation button.

Secondary filtering does not compete with status tabs. Search remains visible. Type filters, score filters, note filters, sort order, and column visibility live in one Settings dialog. Column headers perform the conventional table action: selecting a sortable header toggles ascending/descending order.

## Editing and destructive actions

A row should not carry a permanent menu button merely to expose ordinary editing. Clicking non-interactive row space opens one focused dialog containing all editable user-owned fields that apply to that medium. Existing links, selects, inputs, buttons, and checkboxes keep their own actions and do not trigger the row dialog.

Selection checkboxes exist only for bulk actions. Batch removal has an explicit confirmation dialog and is still constrained by the authenticated user ID on the server.

## Secondary workflows

Import/export, user administration, help, and provider credits are secondary workflows. They use progressive disclosure instead of dashboard card grids:

- Quick Import is one large paste surface followed by candidate review.
- Canonical CSV is the strict provider-ID round-trip path.
- Contextual help opens in dialogs and can be copied without permanently occupying the page.
- Markdown export is a human-readable snapshot; CSV remains the machine round-trip format.
- User creation is expressed as “Add user” and produces a copyable one-time registration link.
- Provider attribution lives in a compact Credits surface rather than a separate About page.

## Provider behavior

External metadata must never become a reason the saved list stops working. Search and enrichment have bounded HTTP deadlines. Rate limits and temporary upstream failures become visible retry-later states; the application does not add retry storms, queues, caches, or new services to hide them. Local-first Add keeps the selected position even if exact enrichment later fails.

Canonical provider APIs remain useful for stable identity, exact revalidation, TV season/episode boundaries, book page counts, covers, and provider URLs. Wikidata is only a bounded localization/discovery adapter. Watch/play time is not a cross-media concept and is deliberately absent from the model.

## Visual language

Keep the dense MyAnimeList-derived table structure and Catppuccin theme family. Prefer low-chrome rows, native table semantics, native dialogs, compact controls, and clear hierarchy over nested cards. Responsive layouts may scroll a genuinely tabular region horizontally rather than pretending every row is an unrelated mobile card. Presentation preferences must stay outside application state unless they affect the user’s actual media data.
