# Interaction design

`media-list` should feel like editing a small personal list, not operating a dashboard. SQLite list state is the product; provider metadata is auxiliary, and normal list interaction remains useful when providers are unavailable.

## Library structure

Status tabs are first-level navigation. Rows are the primary objects:

```text
cover + title
→ year / provider / native title / provider-supplied romanized title
→ personal notes
→ comparable list fields
```

Status, score, progress, and notes are edited directly in the row. There is no second row editor or save-card. Status and score save immediately on change. Progress saves when its focused inline editor is left. Notes display at most five lines by default; clicking ordinary row space expands/collapses the row, while clicking notes edits them in place. Changed notes save when the textarea loses focus.

Links, selects, inputs, buttons, labels, and checkboxes retain their own actions and never trigger row expansion. Notes remain keyboard-focusable rather than turning a table row into a pseudo-button.

The header belongs to the table and scrolls naturally with it. Default ordering is newest `Date updated` first, where the timestamp tracks user-owned list mutations rather than background provider enrichment. Search is always visible. Settings owns media-type/score/note filters, sort direction, and optional columns. `Date added` and `Date updated` are independent optional columns; media types and visible columns each expose their own explicit reset-to-default action. An intentionally empty optional-column set is valid.

Bulk selection is scoped to the IDs currently visible after status/search/filter/sort navigation. Hidden or stale IDs are never included in the count, confirmation, or delete request. Batch removal still requires explicit confirmation and is server-scoped to the authenticated user.

## Add flow

Manual Add is category → canonical provider → exact work (TV: show → season). The search field is the primary flexible-width control and keeps the same logical order on desktop and mobile. Autofocus is used only before a query has results.

Results reserve a stable thumbnail slot even when no cover exists. They show compact provider/year information and available discriminators such as book author, native title, or romanized title. Add buttons have item-specific accessible names. Provider images are fetched directly, but stored large-provider variants are normalized to bounded thumbnail URLs when the provider supports it.

## Secondary workflows

Quick Import, canonical CSV, Markdown export, administration, help, and provider credits remain secondary workflows. Markdown export is a human-readable snapshot split into one table per media type, with rows ordered by list status inside each table. Registration is invite-only. Password recovery is a separate one-time-token flow bound to an existing account; it does not reuse registration invites and does not require email infrastructure. Provider attribution remains in a compact, named Credits dialog.

## Provider behavior

Provider identity remains canonical identity. Exact revalidation, TV season boundaries, book page counts, canonical links, covers, native names and available romanization come from canonical provider APIs. Wikidata remains only a bounded localization/discovery adapter. Provider failure degrades discovery/enrichment rather than saved-list availability.

## Visual language

Keep the dense MyAnimeList-derived table and Catppuccin theme family. Prefer low chrome, semantic tables, native forms/dialogs where a secondary workflow actually needs them, compact controls, and direct manipulation over nested cards or dashboard surfaces.
