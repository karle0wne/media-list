# media-list

`media-list` is a small private, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is designed to feel like editing a personal list on one low-resource VPS, not operating a content platform.

Provider identity is canonical identity: `external_source + external_id + external_sub_id`. Shared provider metadata is stored once; status, score, medium-specific progress, and notes remain private per local data owner. External provider failures never invalidate the saved list.

The repository intentionally keeps only durable product/runtime contracts in this README. Code, tests and database migrations are authoritative for implementation details; do not maintain current-state snapshots, handoff/context files or separate design documents that must be kept synchronized with the implementation.

## Authentication boundary

`media-list` does not authenticate users and does not own login, OIDC, passwords, sessions, roles, invites, recovery flows, or an access allowlist.

Production exposes the application only through the trusted central-auth/reverse-proxy boundary. That boundary authenticates the browser, checks service access, strips spoofed client identity headers, and injects:

- `X-Auth-Subject`
- `X-Auth-Email`
- `X-Auth-Name`

The application maps that trusted identity to a local `users` row used only as a data owner. Existing rows can be linked by verified email when an external subject is first seen. Business data remains scoped by the resolved local owner.

Running the application directly on a public port while accepting arbitrary `X-Auth-*` headers is outside the production security contract.

## Durable product invariants

- The saved list and local user-owned state are the product; provider metadata is auxiliary.
- Canonical media identity comes from provider IDs, never fuzzy title similarity.
- Shared media metadata and per-user state stay separate.
- TV seasons are separate positions identified by TMDB series id plus `season:N`.
- Table and Grid are two presentations of the same filtered/sorted dataset; there is no second state model, detail-page requirement or Kanban model.
- Existing user/media relationships must survive schema/auth migrations.
- Provider failures degrade discovery/enrichment, not access to already saved state.
- Production data, SQLite files, backups, exports and credentials never belong in Git.
- The application must remain viable on one small VPS without Redis, PostgreSQL, external queues, self-hosted mail infrastructure or an image proxy service.

## Capabilities

- AniList anime/donghua, TMDB movies/TV, Open Library books, and RAWG games.
- TV seasons as separate positions using `TMDB series id + season:N`.
- Dense MAL-inspired Catppuccin table with inline status/score/progress/notes editing, sortable/configurable columns, filters, and user-scoped bulk removal.
- Persisted Table/Grid view with responsive 5→4→3→2 poster geometry.
- Notes preview up to five lines, expand with the row, and autosave when inline editing loses focus.
- Category-first manual search with stable thumbnail slots, exact-work discriminators, local-first save, and durable retryable enrichment.
- Bounded Cyrillic alias discovery through Wikidata without making Wikidata canonical.
- Exact RAWG URL → numeric identity resolution; saved RAWG links target the concrete game and covers use bounded provider thumbnails.
- Quick Import from pasted titles/provider URLs with review; canonical CSV import/export; human-readable Markdown export.
- Explicit `npm run providers:smoke` live-provider probe outside routine CI.
- SQLite storage and S3-compatible disaster-recovery backup.

## Providers

- **AniList** — anime/donghua; MAL URLs resolve through AniList's MAL mapping. Native and provider-supplied romaji titles are retained when distinct.
- **TMDB** — movies/TV; requires `TMDB_API_TOKEN`.
- **Open Library** — books, including author disambiguation in Add results.
- **RAWG** — games when `RAWG_API_KEY` is configured.
- **Wikidata** — bounded localized search assistance only, never canonical identity.

Provider HTTP requests have application-owned deadlines. Rate limits and temporary upstream failures become visible retry-later metadata states; there are no automatic retry loops, provider queues, self-hosted mail servers, or image proxy services.

## Entry and export paths

Normal Add is category → canonical provider search → exact selection → immediate local save → durable exact enrichment. Quick Import accepts one title or supported provider URL per line and stages candidates for review. Canonical CSV is the strict machine round trip; Markdown export is human-readable archival.

## Local development

Requirements: Node.js 24.15+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Local/manual requests need trusted identity headers because the application intentionally has no local login screen.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run providers:smoke
```

The main configuration surface is [.env.example](.env.example). Production credentials stay outside this repository.

## Docker Compose

```bash
git clone https://github.com/karle0wne/media-list.git
cd media-list
cp .env.example .env
# Edit provider/storage settings as needed.
docker compose up -d --build
```

Compose applies pending migrations before starting Next.js. SQLite lives at `./data/media-list.db` by default. Production automation may set `APP_IMAGE` to an immutable registry digest and uses the same Compose contract with the application bound privately behind the reverse proxy.

## Database and maintenance

Generate schema migrations with `npm run db:generate`; apply them with `npm run db:migrate`. The migration entrypoint includes an idempotent compatibility bridge for heterogeneous historical databases. It preserves local data-owner/media relations while reconciling the current schema, including cleanup of legacy application-owned authentication state where it still exists.

Routine commands are `npm run cleanup`, `npm run maintenance`, and `npm run metadata:refresh`.

## Backup and restore

The application owns SQLite backup/restore correctness while an external control plane may decide when to invoke it. `npm run backup` writes one validated recovery object, `<S3_PREFIX>latest/media-list.db`; there is no application-managed PITR/history policy. `npm run restore` materializes that object. A confirmed S3/R2 `NoSuchKey` is first bootstrap; other storage failures fail closed.

## Runtime contract

`GET /api/health` verifies database access and returns `APP_REVISION`. Production data, SQLite files, backups, exports and credentials never belong in Git.
