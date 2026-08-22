# media-list specification

`media-list` is a small self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is intentionally closer to an interactive personal list than a content platform: one low-resource VPS, SQLite, a few known users, and no heavy data pipeline.

## Invariants

- The saved list is the product. External metadata is auxiliary: provider outage, timeout, or rate limit must not make existing list state unusable.
- Media identity is `external_source + external_id + external_sub_id`, not title similarity.
- Shared canonical media metadata and per-user state are separate; one user cannot read or mutate another user's state.
- TV seasons are separate positions identified by TMDB series id plus `season:N`.
- Identity, service access, and service-scoped `ADMIN` / `USER` roles belong to shared IAM/SSO rather than provider-specific login code in this application.
- OIDC `sub` is the durable external identity. During migration only, verified email may link that subject to an already-existing active local user; after binding, subject identity is authoritative. Unknown/unapproved identities fail closed.
- The application consumes only roles intended for `media-list`; an administrator of this service does not implicitly become an administrator of any other service.
- Successful external authentication creates the normal local application session. `media-list` owns domain authorization—what a role may do to media data—not upstream identity policy.
- Until real production SSO is proven, legacy registration/password/recovery/magic-link paths may remain as rollback fallback. They are migration mechanics, not the target product contract, and must be removed in a later bounded change after SSO proof.
- OIDC discovery/token calls have an application-owned deadline and use Authorization Code flow with PKCE, state, and nonce validation.
- User state is status, score, medium-specific progress, and notes. Watch/play/reading time is not a shared domain field.
- `COMPLETED` equals the known progress total whenever a total exists, including totals learned later by metadata enrichment.
- Canonical CSV is deterministic and provider IDs are revalidated on import.
- Quick Import is a staging workflow: fuzzy/multilingual matching suggests candidates but never commits an ambiguous result without review.
- Manual search is category-first. Unrelated providers must not add latency to the normal Add path.
- Provider HTTP calls have an application-owned deadline. HTTP 429 and temporary upstream failures are retry-later metadata failures, not reasons to retry in loops or block the saved list.
- Manual Add is local-first: selecting a provider result persists identity/provisional metadata immediately; exact enrichment continues as durable SQLite state (`PENDING → READY` or `ERROR → Retry`).
- Cover URLs are metadata; image bytes are not application state or backup data. Provider URLs are normalized to bounded thumbnails when the provider exposes such a transform.
- Persisted media metadata is deliberately narrow: canonical identity, displayed title/year/link/cover variants, and enrichment state. Provider-only discovery fields remain transient unless the saved list needs them.
- The application remains viable on one small VPS. Redis, PostgreSQL, external queues, caches, self-hosted mail servers, and microservices are not required by `media-list` itself.
- Production data, SQLite files, backups, exports, credentials, auth transaction values, and identity-provider secrets never belong in Git.

## Providers

- Anime/donghua: AniList GraphQL. MAL URLs resolve through AniList `idMal`; native and provider-supplied romaji titles may both be displayed.
- Movies/TV: TMDB using `TMDB_API_TOKEN`.
- Books: Open Library; exact revalidation keeps first-publication semantics consistent with discovery.
- Games: RAWG when `RAWG_API_KEY` is configured. Search is fuzzy; exact `rawg.io/games/<slug>` URLs resolve through RAWG details and are normalized to numeric RAWG identity while list links target the concrete game.
- Wikidata: bounded Cyrillic/localization discovery only.

`npm run providers:smoke` is an explicit live-provider integration probe and intentionally stays outside routine CI.

## Library interaction

Status tabs are primary navigation. Search stays visible; media-type/score/note filters, sorting, direction, and optional columns live in Settings. Default sorting is newest `Date added` first. `Clear filters` clears filtering state without resetting sort/columns; media types and visible columns have independent reset-to-default actions.

Each row uses `title → metadata → notes`. Status, score, progress, and notes are direct row controls. Notes preview up to five lines, row background expands/collapses the preview, and changed notes save on blur. There is no separate row edit dialog. Selection is always reconciled to the currently visible IDs before bulk removal. Detailed rules live in [INTERACTION-DESIGN.md](INTERACTION-DESIGN.md).

## Entry, export, and account paths

1. Manual Add: category → one canonical provider → exact choice (TV: show → season) → immediate local save → durable enrichment.
2. Quick Import: one title or supported provider URL per line → bounded provider discovery → review → save.
3. Canonical CSV: strict provider-ID round trip preserving status/score/progress/notes, with synchronous revalidation.
4. Markdown export: human-readable grouped snapshot; it is not an import contract.
5. Target sign-in: shared IAM authenticates the Google-backed identity and authorizes `media-list` access/role → OIDC callback validates the response → stable subject maps to the local domain user → normal application session.
6. Transitional first binding: verified IAM email must match an existing active local account → persist stable OIDC subject → later logins bind by subject and refresh the effective service role.
7. Legacy invite/password/recovery/magic-link routes remain only until production SSO has been proven and are then removed in a separate migration cleanup.

Messy documents are transformed outside the application into Quick Import lines using the built-in GPT-5.6 helper prompt. The application does not add another LLM-specific import format.
