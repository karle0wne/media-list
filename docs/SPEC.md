# media-list specification

`media-list` is a small invite-only, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is intentionally closer to an interactive personal list than a content platform: one low-resource VPS, SQLite, a few known users, and no heavy data pipeline.

## Invariants

- The saved list is the product. External metadata is auxiliary: provider outage, timeout, or rate limit must not make existing list state unusable.
- Media identity is `external_source + external_id + external_sub_id`, not title similarity.
- Shared canonical media metadata and per-user state are separate; one user cannot read or mutate another user's state.
- TV seasons are separate positions identified by TMDB series id plus `season:N`.
- Registration is invite-only and guarded by `MAX_USERS`.
- User state is status, score, medium-specific progress, and notes. Watch/play/reading time is not a shared domain field.
- `COMPLETED` fills progress to the known total when a total exists.
- Canonical CSV is deterministic and provider IDs are revalidated on import.
- Quick Import is a staging workflow: fuzzy/multilingual matching suggests candidates but never commits an ambiguous result without review.
- Manual search is category-first. Unrelated providers must not add latency to the normal Add path.
- Provider HTTP calls have an application-owned deadline. HTTP 429 and temporary upstream failures are retry-later metadata failures, not reasons to retry in loops or block the saved list.
- Manual Add is local-first: selecting a provider result persists identity/provisional metadata immediately; exact enrichment continues as durable SQLite state (`PENDING → READY` or `ERROR → Retry`).
- Cover URLs are metadata; image bytes are not application state or backup data and load directly from provider CDNs.
- The application remains viable on one small VPS. Redis, PostgreSQL, external queues, caches, and microservices are not required.
- Production data, SQLite files, backups, exports, credentials, and tokens never belong in Git.

## Providers

- Anime/donghua: AniList GraphQL. MAL URLs resolve through AniList `idMal`.
- Movies/TV: TMDB using `TMDB_API_TOKEN`.
- Books: Open Library.
- Games: RAWG when `RAWG_API_KEY` is configured. Search is fuzzy; exact `rawg.io/games/<slug>` URLs resolve through RAWG details and are normalized to numeric RAWG identity.
- Wikidata: bounded Cyrillic/localization discovery only. Sparse Cyrillic AniList/RAWG results may be augmented with at most two English aliases; provider identity remains canonical.

Provider APIs are retained for exact stable identity, deterministic revalidation, TV season/episode structure, book page counts, provider URLs, and covers. Generic wiki data is not a substitute for those contracts.

`npm run providers:smoke` is an explicit live-provider integration probe. It is intentionally opt-in rather than automatic CI so routine verification does not spend API quota.

## Library interaction

Status tabs are primary navigation. Search stays visible; type/score/note filters, sorting, direction, and optional columns live in Settings. Sortable headers toggle ascending/descending order.

Each row uses `title → metadata → notes`. Status and score autosave on change. Clicking non-interactive row space opens one edit dialog for applicable user-owned fields. Row checkboxes enable user-scoped bulk removal. Detailed rules live in [INTERACTION-DESIGN.md](INTERACTION-DESIGN.md).

## Entry and export paths

1. Manual Add: category → one canonical provider → exact choice (TV: show → season) → immediate local save → durable enrichment.
2. Quick Import: one title or supported provider URL per line → bounded provider discovery → review → save. Exact RAWG URLs are supported through slug resolution.
3. Canonical CSV: strict provider-ID round trip preserving status/score/progress/notes, with synchronous revalidation.
4. Markdown export: human-readable grouped snapshot for reading or archival; it is not an import contract.

Messy documents are transformed outside the application into Quick Import lines using the built-in copyable GPT-5.6 helper prompt. The application itself accepts only the simple list field or canonical CSV; there is no separate LLM-migration CSV format.
