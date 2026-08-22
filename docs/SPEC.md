# media-list specification

`media-list` is a small invite-only, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is intentionally closer to an interactive personal list than a content platform: one low-resource VPS, SQLite, a few known users, and no heavy data pipeline.

## Invariants

- The saved list is the product. External metadata is auxiliary: provider outage, timeout, or rate limit must not make existing list state unusable.
- Media identity is `external_source + external_id + external_sub_id`, not title similarity.
- Shared canonical media metadata and per-user state are separate; one user cannot read or mutate another user's state.
- TV seasons are separate positions identified by TMDB series id plus `season:N`.
- Registration is invite-only and guarded by `MAX_USERS`.
- A nullable unique email on an active existing user is the passwordless-login allowlist. Magic-login tokens are hashed at rest, short-lived, one-time, and revoked when the user is disabled or its email identity changes. Requests for unknown emails are indistinguishable from allowed requests at the public response surface.
- GETting a magic-login URL never consumes its credential. Consumption happens only after an explicit POST from the landing page, so automated mail-link scanners cannot consume the login credential.
- Passwordless email delivery is optional and uses a bounded external transactional-mail adapter; the application does not require a self-hosted SMTP/mail service. If delivery configuration is absent, the passwordless UI is disabled while password login/recovery remains operational.
- Password reset is a distinct one-time token bound to an existing active user. Tokens are hashed at rest, expire, are consumed on success, and successful reset revokes prior sessions. Registration invites are never password-reset credentials.
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
- Production data, SQLite files, backups, exports, credentials, reset tokens, invite tokens, and magic-login tokens never belong in Git.

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

Grid view is an alternate poster-first presentation over the exact same filtered and sorted dataset. It does not introduce a media detail page, Kanban, or a second state model. Cards show cover, title, type/year, status, score, progress where applicable, and `Date updated`; cover/title point to the canonical external media page. Normal desktop uses four columns, large desktop five, narrower layouts three, and phones two. The desktop grid width is bounded so cards remain stable and readable. The user's Table/Grid choice is persisted in browser-local storage and survives reload/navigation in that browser without requiring account/auth changes. Detailed rules live in [INTERACTION-DESIGN.md](INTERACTION-DESIGN.md).

## Entry, export, and account paths

1. Manual Add: category → one canonical provider → exact choice (TV: show → season) → immediate local save → durable enrichment.
2. Quick Import: one title or supported provider URL per line → bounded provider discovery → review → save.
3. Canonical CSV: strict provider-ID round trip preserving status/score/progress/notes, with synchronous revalidation.
4. Markdown export: human-readable snapshot with one table per media type and status-ordered rows inside each table; it is not an import contract.
5. Account creation: admin-generated one-time registration invite.
6. Passwordless login: admin assigns a unique email to an existing account → public request returns a generic response → configured transactional-mail adapter sends a short-lived link → GET renders confirmation without consuming → explicit POST consumes and creates the normal session.
7. Password recovery: admin-generated one-time reset URL for an existing user; a locked-out operator can use `npm run admin:create-password-reset -- <username>` or the direct emergency `admin:set-password` command from the trusted runtime environment.

Messy documents are transformed outside the application into Quick Import lines using the built-in GPT-5.6 helper prompt. The application does not add another LLM-specific import format.
