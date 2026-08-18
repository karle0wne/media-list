# media-list MVP specification

`media-list` is a small invite-only, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is intentionally designed for one low-resource VPS and a few known users.

## Invariants

- Media identity is provider identity, not title similarity: `external_source + external_id + external_sub_id`.
- Shared canonical media metadata and per-user state are separate. A user must never read or mutate another user's state.
- TV seasons are separate positions. TMDB series id plus `season:N` is the canonical identity of a season.
- Registration is invite-only and guarded by `MAX_USERS`; there is no public sign-up.
- Canonical CSV is deterministic and IDs are revalidated against providers on import.
- Quick/LLM imports are staging workflows. Fuzzy/multilingual matching may suggest candidates but never writes an ambiguous result without review.
- Manual search is category-first. Anime waits only for AniList (plus localized fallback when necessary), movies only for TMDB movie search, books only for Open Library, games only for RAWG, and TV search first finds shows then loads seasons only for the selected show. Unrelated providers must not add latency to manual search.
- A manual Add must not wait for a second provider round trip after the user has selected an exact provider result. The selected identity is persisted locally first; exact metadata verification/enrichment is durable asynchronous work.
- Pending metadata work is persisted in SQLite. Browser disconnects, reloads and process restarts must not silently lose it. Provider failure leaves the list item visible with retryable error state rather than undoing the add.
- Provider cover URLs are metadata. Poster/image binaries are not application state and are not included in SQLite backups. Provider covers are delivered directly from provider CDNs rather than proxied through the VPS image optimizer.
- Production data, SQLite files, backups, CSV exports, credentials and tokens never belong in Git.
- The application must remain viable on a single small VPS; no Redis, PostgreSQL, external queue or microservices are required for the MVP.

## Providers

- Anime/donghua: AniList GraphQL. MAL URLs can be resolved through AniList's `idMal` lookup.
- Movies and TV: TMDB. A TMDB API Read Access Token is required.
- Books: Open Library.
- Games: RAWG. `RAWG_API_KEY` enables game search. RAWG data/images are visibly attributed with an active RAWG link wherever they are displayed.
- Cyrillic/localized anime fallback: Wikidata aliases may be used only after direct AniList search returns no candidates. Wikidata is only a resolver fallback, not canonical identity.

## User state

Each list entry has status (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ON_HOLD`, `DROPPED`), score 0-10, progress, notes, and optional manual time override.

Video watch time is derived from provider runtime and progress when possible. For books, pages are the primary progress metric and actual reading time is optional/manual because page count does not define reading duration. For games, provider-reported average playtime is never treated as the user's time; played time is user-owned and recorded through the manual time field.

## Entry paths

1. Manual canonical add: choose category -> search only its canonical provider -> explicit exact choice (for TV: show -> season) -> immediate local save -> durable provider verification/enrichment. Search-result metadata is provisional until verification reaches `READY`; failures become visible `ERROR` state with retry.
2. Canonical CSV: strict source/id based round-trip import/export with synchronous provider revalidation.
3. Quick import: paste titles or supported provider URLs (including Cyrillic titles and RAWG game URLs when configured) -> resolve candidates across applicable providers -> review -> save.
4. LLM migration: arbitrary legacy document is converted externally into migration CSV -> media-list validates/resolves -> review -> save.

Migration CSV requires either `title` or `source_url`. Optional columns are `status`, `score`, `progress_current`, `progress_total`, `notes`, `time_spent_override_minutes`.
