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

Network placement is not the only guard. The gateway and the application share a secret (`GATEWAY_SHARED_SECRET`, at least 32 characters): the gateway sends it as `X-Gateway-Secret` on every request it forwards and removes any copy a client supplies. The application compares it in constant time before it reads a single `X-Auth-*` header and answers `401` otherwise, so identity headers forged by anything that is not the gateway are ignored. In production the container (and `npm start`) refuses to start without the secret, with one readable error (`scripts/check-config.ts`; Next.js alone would only log the failure and answer 500); `ALLOW_UNSIGNED_GATEWAY_HEADERS=true` is the explicit opt-out for an installation isolated by the network alone, and only an explicit `NODE_ENV=development` or `test` runtime needs no secret (an unset or unrecognised `NODE_ENV` is treated like production). `/api/health` is the only unauthenticated route and exposes liveness and the revision only.

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

Provider HTTP requests have application-owned deadlines. Rate limits, outages and timeouts leave a record pending and pause only the affected provider (honouring `Retry-After`); a record that keeps failing becomes a visible error that can be retried. Interrupted work is finished by one bounded background pass every `ENRICHMENT_RECOVERY_INTERVAL_SECONDS` (started when the server starts, never by a page view). There are no provider queues, self-hosted mail servers, or image proxy services.

## Entry and export paths

Normal Add is category → canonical provider search → exact selection → immediate local save → durable exact enrichment. Quick Import accepts one title or supported provider URL per line and stages candidates for review. Canonical CSV is the strict machine round trip; Markdown export is human-readable archival.

## Local development

Use the Node.js version range declared in `package.json`.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Local/manual requests need trusted identity headers (`X-Auth-Subject`, `X-Auth-Email`, `X-Auth-Name`) because the application intentionally has no local login screen. Development mode does not require the gateway secret.

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
echo "GATEWAY_SHARED_SECRET=$(openssl rand -hex 32)" >> .env   # then give the same value to the gateway
mkdir -p data && sudo chown 10001:10001 data                    # the container runs as uid 10001
# Edit provider/storage settings in .env as needed.
docker compose up -d --build
```

The container runs as an unprivileged user (uid 10001) under `tini`, applies pending migrations, then starts Next.js; `docker stop` is a clean shutdown. A data directory the user cannot write to is reported at start instead of failing later (`scripts/check-config.ts`, which `npm start` runs too). The container exits at start with a clear message when `GATEWAY_SHARED_SECRET` (or another required setting) is missing or invalid. The Compose/environment configuration is authoritative for the current local data path and runtime image. Production uses the same Compose contract with the application bound privately behind the reverse proxy.

The published image (`Dockerfile.runtime`, built by CI over an already verified build) and the one Compose builds (`Dockerfile`) share the same runtime stage; a test keeps them identical.

## Database and maintenance

The migration history is one baseline (`drizzle/*_init`) that creates the whole schema; the service had no production data when it was consolidated, so there is no legacy bridge. Change `src/db/schema.ts`, run `npm run db:generate` and commit the result; a test fails when the schema and the migrations drift apart. Apply migrations with `npm run db:migrate` (the container does it at every start; it is idempotent).

Routine commands are `npm run cleanup`, `npm run maintenance`, and `npm run metadata:refresh`.

## Backup and restore

The application owns SQLite backup/restore correctness while an external control plane may decide when to invoke it (`npm run backup`, `npm run restore`). Each backup is a validated `VACUUM INTO` snapshot uploaded twice under `S3_PREFIX`: as a dated version `history/<UTC stamp>-<sha256 prefix>.db` and as the recovery object `latest/media-list.db`. The version is written first, so a failed upload never leaves `latest` pointing at something without history. The newest `BACKUP_KEEP_VERSIONS` (default 30) versions are kept; pruning failures are warnings, not backup failures. The SHA-256 of every object is stored with it and checked on restore: an object without a checksum, or a version whose name does not match its content, is refused. The version just written is never pruned, even when the host clock stepped back.

`npm run restore` restores `latest`, refuses a file that is not a media-list database (no `users`/`media`/`user_media` tables) and keeps the database it replaces as `<database>.before-restore-<stamp>`; `npm run restore -- --list` shows the stored versions and `npm run restore -- history/<name>.db` restores one of them (arbitrary keys are refused). The durable contract is a validated S3-compatible disaster-recovery object; confirmed absence of the `latest` object is first bootstrap, while other storage failures, a missing explicit version and checksum mismatches fail closed.

## Runtime contract

`GET /api/health` verifies database access and reports the deployed application revision. Production data, SQLite files, backups, exports and credentials never belong in Git.
