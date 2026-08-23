# media-list specification

`media-list` is a small private, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is intentionally closer to an interactive personal list than a content platform: one low-resource VPS, SQLite, a few known data owners, and no heavy data pipeline.

## Invariants

- The saved list is the product. External metadata is auxiliary: provider outage, timeout, or rate limit must not make existing list state unusable.
- Media identity is `external_source + external_id + external_sub_id`, not title similarity.
- Shared canonical media metadata and per-user state are separate; one local data owner cannot read or mutate another owner's state.
- Authentication and service access are external to the application. Production requests arrive only through a trusted gateway/reverse proxy that injects `X-Auth-Subject`, `X-Auth-Email`, and `X-Auth-Name` after access validation.
- `users` is a local data-ownership table, not an IAM database. The trusted external subject is the stable identity link; verified email may link an existing legacy data-owner row on first contact.
- Client-supplied `X-Auth-*` headers must never be trusted at a public boundary. The reverse proxy strips them before copying gateway-produced identity headers.
- The application has no login, password, OIDC-client, session, invite, recovery, role-management, or access-allowlist surface.
- TV seasons are separate positions identified by TMDB series id plus `season:N`.
- User state is status, score, medium-specific progress, and notes. Watch/play/reading time is not a shared domain field.
- `COMPLETED` equals the known progress total whenever a total exists, including totals learned later by metadata enrichment.
- Canonical CSV is deterministic and provider IDs are revalidated on import.
- Quick Import is a staging workflow: fuzzy/multilingual matching suggests candidates but never commits an ambiguous result without review.
- Manual search is category-first. Unrelated providers must not add latency to the normal Add path.
- Provider HTTP calls have an application-owned deadline. HTTP 429 and temporary upstream failures are retry-later metadata failures, not reasons to retry in loops or block the saved list.
- Manual Add is local-first: selecting a provider result persists identity/provisional metadata immediately; exact enrichment continues as durable SQLite state (`PENDING → READY` or `ERROR → Retry`).
- Cover URLs are metadata; image bytes are not application state or backup data. Provider URLs are normalized to bounded thumbnails when the provider exposes such a transform.
- Persisted media metadata is deliberately narrow: canonical identity, displayed title/year/link/cover variants, and enrichment state. Provider-only discovery fields remain transient unless the saved list needs them.
- The application remains viable on one small VPS. Redis, PostgreSQL, external queues, caches, self-hosted mail servers, and microservices are not required.
- Production data, SQLite files, backups, exports and credentials never belong in Git.

## Providers

- Anime/donghua: AniList GraphQL. MAL URLs resolve through AniList `idMal`; native and provider-supplied romaji titles may both be displayed.
- Movies/TV: TMDB using `TMDB_API_TOKEN`.
- Books: Open Library; exact revalidation keeps first-publication semantics consistent with discovery.
- Games: RAWG when `RAWG_API_KEY` is configured. Search is fuzzy; exact `rawg.io/games/<slug>` URLs resolve through RAWG details and are normalized to numeric RAWG identity while list links target the concrete game.
- Wikidata: bounded Cyrillic/localization discovery only.

`npm run providers:smoke` is an explicit live-provider integration probe and intentionally stays outside routine CI.

## Library interaction

The library opens directly on its working controls and content; it does not reserve a hero block for a title/count summary. `+ Add media` is kept visually prominent at the left, status tabs are centered, and `Filter`, `Sort`, Table/Grid, and display settings are grouped at the right on desktop. Responsive layouts may wrap this into two rows while keeping the status tabs together on one horizontally scrollable line.

Status tabs are primary navigation and reuse the existing status palette as low-emphasis underlines. Search stays visible. Filter owns media-type/score/note constraints, Sort owns ordering/direction, and display settings own optional table columns. Default sorting is newest `Date updated` first; this timestamp changes with user-owned list edits, while `Date added` remains available as a separate optional column and sort key. Media types and visible columns have independent reset-to-default actions.

Table view remains the direct-editing surface. Each row uses `title → metadata → notes`. Status, score, progress, and notes are direct row controls. Notes preview up to five lines, row background expands/collapses the preview, and changed notes save on blur. There is no separate row edit dialog. Selection is always reconciled to the currently visible IDs before bulk removal.

Grid view is an alternate poster-first presentation over the exact same filtered and sorted dataset. It does not introduce a media detail page, Kanban, or a second state model. Cards show cover, title, type/year, status, score, progress where applicable, and `Date updated`; cover/title point to the canonical external media page. Normal desktop uses four columns, large desktop five, narrower layouts three, and phones two. The desktop grid width is bounded so cards remain stable and readable. The user's Table/Grid choice is persisted in browser-local storage and survives reload/navigation in that browser without involving authentication state. Detailed rules live in [INTERACTION-DESIGN.md](INTERACTION-DESIGN.md).

## Entry and export paths

1. Manual Add: category → one canonical provider → exact choice (TV: show → season) → immediate local save → durable enrichment.
2. Quick Import: one title or supported provider URL per line → bounded provider discovery → review → save.
3. Canonical CSV: strict provider-ID round trip preserving status/score/progress/notes, with synchronous revalidation.
4. Markdown export: human-readable snapshot with one table per media type and status-ordered rows inside each table; it is not an import contract.

Messy documents are transformed outside the application into Quick Import lines using a general-purpose assistant when useful. The application does not add another LLM-specific import format.

## Trusted identity resolution

Every business request resolves the identity supplied by the trusted gateway. A known `external_subject` selects its existing local owner directly. On first contact, a verified trusted email may attach that subject to the matching local row; otherwise a new local data-owner row can be materialized from the trusted identity. This mapping exists only to scope media data and does not recreate authentication policy inside the application.

Historical databases may still contain application-auth tables/columns from older releases. The idempotent compatibility migration is allowed to remove that obsolete state while preserving current local users and their media relations.
