# media-list

A small invite-only self-hosted media tracker for anime/donghua, movies, TV seasons, and books. It is built for a few known users on one low-resource VPS rather than as a public service.

The core rule is that titles are for display and search; identity comes from an external provider ID. Shared media metadata is stored once, while status, score, progress, notes and time are private per user.

## Stack

- Next.js App Router + TypeScript
- SQLite via Node 24 `node:sqlite`
- Drizzle ORM + one immutable Drizzle migration chain
- Local username/password auth with server-side opaque sessions
- AniList for anime/donghua
- TMDB for movies and TV seasons
- Open Library for books
- Wikidata only as a multilingual resolver fallback for Cyrillic anime titles
- S3-compatible backups (including Cloudflare R2)
- Docker Compose as the standalone runtime contract

See [docs/SPEC.md](docs/SPEC.md) for the product invariants and scope.

## What it does

- Manual provider search and explicit add.
- Tracks `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ON_HOLD`, `DROPPED`, score 0-10, progress and notes.
- Treats each TV season as a separate item (`TMDB series id + season:N`).
- Computes consumed video time from runtime and progress; books keep page progress separate from optional manual time.
- Invite-only registration with admin enable/disable controls and a `MAX_USERS` guard.
- Canonical CSV export/import using provider IDs.
- Quick import from titles or supported provider URLs, with review before commit.
- LLM-assisted migration CSV for messy legacy lists; LLM output is still revalidated against providers.
- Persistent SQLite, provider metadata refresh, retention cleanup and S3-compatible backups.

## Provider configuration

AniList and Open Library do not need an application key for the read-only calls used here. TMDB uses one server-side API Read Access Token for the installation; put it in `TMDB_API_TOKEN` and never commit it.

TMDB metadata is timestamped when stored and can be refreshed with `npm run metadata:refresh`. `TMDB_METADATA_TTL_DAYS` defaults to 30 days and `TMDB_REFRESH_LIMIT` limits work per run. Refresh updates shared provider metadata only; user status, score, progress and notes are not touched.

The application includes the required TMDB attribution on `/about`.

Supported URLs in Quick Import include AniList, MyAnimeList anime URLs, TMDB movies/TV seasons, IMDb title URLs (resolved through TMDB), and Open Library works. A bare TMDB TV-series URL resolves to season candidates because the service stores seasons, not whole series.

## Local development

Requirements: Node.js 24.15+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run admin:create -- admin 'use-a-long-local-password'
npm run dev
```

Open `http://127.0.0.1:3000` and sign in with the admin account.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Standalone Docker Compose

`media-list` remains independently deployable and has no dependency on the owner's private infrastructure repository:

```bash
git clone https://github.com/karle0wne/media-list.git
cd media-list
cp .env.example .env
# Edit .env.
docker compose up -d --build
docker compose exec app npm run admin:create -- admin 'use-a-long-local-password'
```

Compose explicitly applies pending Drizzle migrations before starting Next.js. The SQLite file lives at `./data/media-list.db`. Standalone use builds the local image as `media-list:local`. Production automation may set `APP_IMAGE` to an immutable registry digest and use the same Compose contract with `docker compose pull` and `docker compose up --no-build`.

For local or temporary direct access, the defaults expose `0.0.0.0:3000`. Direct public HTTP is not the recommended production configuration. Production should put the app behind HTTPS and set:

```text
APP_BIND=127.0.0.1
APP_PORT=<host port assigned to this service>
APP_BASE_URL=https://media.example.com
COOKIE_SECURE=true
```

A reverse proxy such as Caddy terminates TLS. `APP_PORT` makes multiple Compose services on one VPS possible without host-port collisions.

## Database migrations

Schema changes are generated with:

```bash
npm run db:generate
```

Generated migration folders under `drizzle/` are immutable once applied. Runtime deployment uses only:

```bash
npm run db:migrate
```

There is no second application migration engine. `scripts/migrate.ts` contains only a compatibility bridge for databases created by the first release: if it sees the old `app_migrations/0000_init` marker and no Drizzle history, it records that existing schema as the Drizzle baseline and then delegates to Drizzle. New databases go directly through the Drizzle chain.

## Invite-only access

There is no public registration path that can create an account without a valid one-time invite. The first admin is created from the command line. `MAX_USERS=5` is a capacity guard, not a billing quota.

## Canonical CSV

Use **Import / Export -> Download my canonical CSV**. Provider IDs remain the identity; titles are not trusted as identity during import and provider records are resolved again before insertion.

## Quick / LLM migration

For clean data, paste one title or provider URL per line. For arbitrary Word/Excel/text material, convert externally to the migration CSV shape documented by the UI/spec and upload that CSV. Provider URLs produced by an LLM are still resolved against the real provider and shown on the review screen.

## Retention and maintenance

`npm run cleanup` applies the local retention policy:

- expired sessions are removed;
- import staging batches older than about 7 days are removed (rows cascade);
- used or long-expired invites are removed after about 30 days.

`npm run maintenance` runs cleanup plus stale TMDB metadata refresh. A production control plane can schedule this command without owning its implementation.

## Backup and restore

The recovery model intentionally has no application-managed backup history. Configure the `S3_*` variables and run:

```bash
docker compose exec app npm run backup
```

`npm run backup` creates a transactionally consistent SQLite snapshot with `VACUUM INTO`, verifies it with `PRAGMA quick_check`, and uploads it to one fixed recovery object:

```text
<S3_PREFIX>latest/media-list.db
```

Each successful backup replaces that object. There are no timestamped snapshots, monthly copies, retention rules or application-side storage-budget policy. If a deployment needs rollback protection, that is a separate short-lived local snapshot described below rather than remote backup history.

The admin page records the time of the last successful remote backup.

Remote restore always restores that same recovery object. Stop the normal application before restoring:

```bash
docker compose stop app
docker compose run --rm app npm run restore
docker compose up -d app
```

The downloaded SQLite file is validated before it atomically replaces the database. In managed disaster recovery the control plane invokes the same application-owned restore command before the first normal application startup.

Transactional deployment rollback is deliberately separate from disaster recovery. The runtime contract exposes:

```bash
npm run snapshot -- /data/pre-deploy.db
npm run restore:local -- /data/pre-deploy.db
```

`pre-deploy.db` exists only for the current deployment transaction and is removed after success or rollback. It is not durable backup history. The control plane decides when to invoke these commands but does not duplicate SQLite snapshot or restore logic.

## Health / revision contract

`GET /api/health` verifies DB access and returns the running `APP_REVISION`. Deployment automation can therefore verify the expected source revision while independently verifying the container image digest that Docker actually started.

## Data and secret policy

This public repository must never contain production data or credentials. `.gitignore` and `.dockerignore` exclude SQLite files, WAL/SHM files, `.env`, CSV exports and backup directories. Production credentials belong outside this repository.

## CI and image publishing

Ordinary pull requests run install, lint, typecheck, invariant tests, and a production Next build. The Node/npm and Next build caches are persisted between runs. A Docker/Compose runtime smoke test is intentionally opt-in through the `smoke` label: it builds a local image for the exact PR revision and then starts that image through the production `APP_IMAGE` / `--no-build` Compose path before checking the revision-aware health endpoint.

On a push to `main`, the same CI first completes the full `verify` job. Only after that succeeds does `publish` build the immutable image tagged with the exact source commit SHA, push it to `ghcr.io/karle0wne/media-list`, and record the resulting registry digest. Publishing does not start the application and is not itself a production deployment. Production must deploy by digest (`ghcr.io/karle0wne/media-list@sha256:...`), never by a mutable tag; the private control plane separately selects the desired digest and performs deployment health checks.
