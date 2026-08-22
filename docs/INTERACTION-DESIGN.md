# Interaction design

`media-list` should feel like editing a small personal list, not operating a dashboard. SQLite list state is the product; provider metadata is auxiliary, and normal list interaction remains useful when providers are unavailable.

## Library structure

The library starts with the working controls rather than a decorative page hero. `+ Add media` sits at the left, status navigation is visually centered, and compact `Filter`, `Sort`, view-mode, and display-settings controls sit at the right. Search remains visible immediately below that command row.

Status tabs are first-level navigation. Their status-specific colors are deliberately subtle and reuse the same status palette as rows/cards so the visual grouping is reinforced without turning the tabs into high-emphasis buttons.

Table view remains the dense editing surface. Rows are the primary editable objects:

```text
cover + title
→ year / provider / native title / provider-supplied romanized title
→ personal notes
→ comparable list fields
```

Status, score, progress, and notes are edited directly in the row. There is no second row editor or save-card. Status and score save immediately on change. Progress saves when its focused inline editor is left. Notes display at most five lines by default; clicking ordinary row space expands/collapses the row, while clicking notes edits them in place. Changed notes save when the textarea loses focus.

Links, selects, inputs, buttons, labels, and checkboxes retain their own actions and never trigger row expansion. Notes remain keyboard-focusable rather than turning a table row into a pseudo-button.

Grid view is an optional presentation of the same filtered/sorted list, not a second editing model. It uses poster-first cards with title, type/year, status, score, progress, and update date; cover/title links still open the canonical external media page. There is no card detail page and no Kanban mode. Grid geometry is intentionally predictable: large desktop uses five columns, normal desktop four, narrower layouts three, and phones two. The grid uses a bounded desktop width so covers stay readable instead of stretching across very wide displays. The chosen Table/Grid mode is persisted in browser-local preferences and survives reload/navigation on that browser without involving authentication state.

The header belongs to the table and scrolls naturally with it. Default ordering is newest `Date updated` first, where the timestamp tracks user-owned list mutations rather than background provider enrichment. Filter owns media-type/score/note constraints, Sort owns ordering/direction, and the gear owns optional table columns. `Date added` and `Date updated` are independent optional columns; media types and visible columns each expose their own explicit reset-to-default action. An intentionally empty optional-column set is valid.

Bulk selection is scoped to the IDs currently visible after status/search/filter/sort navigation. Hidden or stale IDs are never included in the count, confirmation, or delete request. Batch removal still requires explicit confirmation and is server-scoped to the authenticated user.

## Add flow

Manual Add is category → canonical provider → exact work (TV: show → season). The search field is the primary flexible-width control and keeps the same logical order on desktop and mobile. Autofocus is used only before a query has results.

Results reserve a stable thumbnail slot even when no cover exists. They show compact provider/year information and available discriminators such as book author, native title, or romanized title. Add buttons have item-specific accessible names. Provider images are fetched directly, but stored large-provider variants are normalized to bounded thumbnail URLs when the provider supports it.

## Secondary workflows

Quick Import, canonical CSV, Markdown export, administration, help, and provider credits remain secondary workflows. Markdown export is a human-readable snapshot split into one table per media type, with rows ordered by list status inside each table. Registration is invite-only. Password recovery is a separate one-time-token flow bound to an existing account; it does not reuse registration invites and does not require email infrastructure. Provider attribution remains in a compact, named Credits dialog.

## Provider behavior

Provider identity remains canonical identity. Exact revalidation, TV season boundaries, book page counts, canonical links, covers, native names and available romanization come from canonical provider APIs. Wikidata remains only a bounded localization/discovery adapter. Provider failure degrades discovery/enrichment rather than saved-list availability.

## Visual language

Keep the dense MyAnimeList-derived table as the primary editing view and the Catppuccin theme family. The optional poster grid is a viewing alternative over the same list, not a dashboard/card rewrite of the product. Prefer low chrome, native forms/dialogs for secondary workflows, compact controls, direct manipulation in table mode, and predictable responsive geometry.
