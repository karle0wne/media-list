# media-list

`media-list` is a small invite-only, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is designed for a few known users on one low-resource VPS rather than as a public service.

The application treats external provider identity as canonical identity: titles are for display and search, while a media item is identified by `external_source + external_id + external_sub_id`. Shared provider metadata is stored once; status, score, progress, notes, and user-owned time remain private per user.

See [docs/SPEC.md](docs/SPEC.md) for the authoritative product invariants and detailed behavior.

## Capabilities

- Invite-only local accounts with an installation-level `MAX_USERS` guard.
- Anime/donghua through AniList, movies and TV through TMDB, books through Open Library, and games through RAWG.
- TV seasons stored as separate items using `TMDB series id + season:N`.
- Dense list-centric library with status tabs, focused inline updates, responsive rows, and selectable Catppuccin/soft themes.
- Manual category-first provider search and explicit exact selection.
- Local-first add flow: the selected provider identity is saved immediately, then durable metadata verification/enrichment continues from SQLite. Provider failures remain visible and retryable instead of undoing the add.
- Canonical CSV import/export based on provider IDs.
- Quick import from titles and supported provider URLs with review before commit.
- LLM-assisted migration CSV for messy legacy lists; provider identities are still revalidated by the application.
- Persistent SQLite storage, cleanup/maintenance commands, and S3-compatible disaster-recovery backup.

## Providers

- **AniList** — anime/donghua. MyAnimeList anime URLs can be resolved through AniList's MAL identity mapping.
- **TMDB** — movies and TV. Requires `TMDB_API_TOKEN`.
- **Open Library** — books.
- **RAWG** — games. Enabled when `RAWG_API_KEY` is configured. Provider-reported average playtime is metadata only and is never treated as the user's played time.
- **Wikidata** — resolver fallback for localized/Cyrillic anime search only; it is not canonical identity.

Provider HTTP calls have application-owned deadlines so a stalled upstream becomes an observable search/enrichment failure rather than an unbounded request. Provider cover URLs are stored as metadata and images are served directly from provider CDNs.

TMDB and RAWG attribution/backlinks are rendered by the application where required.

## Entry paths

For a normal manual add, choose a category, search only its canonical provider, select an exact candidate, and add it. The application persists the selected identity first and performs exact metadata verification/enrichment durably afterward.

Canonical CSV is the deterministic round-trip format. Quick import accepts titles and supported provider URLs, resolves candidates, then requires review. LLM migration is intentionally an external conversion step: arbitrary source material is converted to the migration CSV shape, after which `media-list` performs its own provider resolution and validation.

RAWG game URLs are intentionally not canonical Quick Import inputs until there is an exact documented URL-to-numeric-ID resolver; game titles can still resolve through RAWG when the provider is configured.

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

The main configuration surface is documented in [.env.example](.env.example). `TMDB_API_TOKEN` enables TMDB-backed categories and `RAWG_API_KEY` enables games. Production credentials must stay outside this repository.

## Docker Compose

The repository is independently deployable and does not depend on the owner's private infrastructure repository:

```bash
git clone https://github.com/karle0wne/media-list.git
cd media-list
cp .env.example .env
# Edit .env.
docker compose up -d --build
docker compose exec app npm run admin:create -- admin 'use-a-long-local-password'
```

Compose applies pending Drizzle migrations before starting Next.js. The SQLite database lives at `./data/media-list.db` by default.

For production behind HTTPS, bind the application to loopback and put a reverse proxy in front of it:

```text
APP_BIND=127.0.0.1
APP_PORT=<host port assigned to this service>
APP_BASE_URL=https://media.example.com
COOKIE_SECURE=true
```

Production automation may set `APP_IMAGE` to an immutable registry digest and use the same Compose runtime contract without rebuilding on the host.

## Database and maintenance

Schema migrations are generated with:

```bash
npm run db:generate
```

Applied migration history under `drizzle/` is immutable. Runtime deployment applies pending migrations with:

```bash
npm run db:migrate
```

Routine maintenance is available through:

```bash
npm run cleanup
npm run maintenance
npm run metadata:refresh
```

`cleanup` removes expired sessions and stale staging/invite data. `maintenance` combines cleanup with stale TMDB metadata refresh. These commands are application-owned; an external control plane may schedule them without reimplementing their behavior.

## Backup and restore

The application owns SQLite snapshot/restore correctness while an external control plane may decide when to invoke it.

With `S3_*` configured:

```bash
docker compose exec app npm run backup
```

A successful backup creates and validates a transactionally consistent SQLite snapshot, then replaces one durable recovery object:

```text
<S3_PREFIX>latest/media-list.db
```

There is no application-managed timestamped backup history, monthly retention policy, or storage-budget policy. Remote restore always targets that same recovery object:

```bash
docker compose stop app
docker compose run --rm app npm run restore
docker compose up -d app
```

Deployment rollback is a separate short-lived local transaction using:

```bash
npm run snapshot -- /data/pre-deploy.db
npm run restore:local -- /data/pre-deploy.db
```

The local pre-deploy snapshot is not durable backup history.

## Runtime contract

`GET /api/health` verifies database access and returns the running `APP_REVISION`. Deployment automation can use that revision together with the actual container image digest to verify what is running.

Production data, SQLite files, backups, CSV exports, credentials, and tokens must never be committed to this repository.
