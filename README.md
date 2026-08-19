# media-list

`media-list` is a small invite-only, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is designed to feel like editing a personal list on one low-resource VPS, not operating a content platform.

Provider identity is canonical identity: `external_source + external_id + external_sub_id`. Shared provider metadata is stored once; status, score, medium-specific progress, and notes remain private per user. External provider failures never invalidate the saved list.

See [docs/SPEC.md](docs/SPEC.md) for product invariants and [docs/INTERACTION-DESIGN.md](docs/INTERACTION-DESIGN.md) for the durable UI structure.

## Capabilities

- Invite-only local accounts with `MAX_USERS` guard and copyable one-time invite links.
- AniList anime/donghua, TMDB movies/TV, Open Library books, and RAWG games.
- TV seasons as separate positions using `TMDB series id + season:N`.
- Dense MAL-inspired Catppuccin table with status tabs, autosaving status/score, sortable columns, configurable filters/columns, focused row dialogs, and bulk removal.
- Category-first manual search and local-first Add with durable retryable enrichment.
- Bounded Cyrillic alias discovery through Wikidata without making Wikidata canonical.
- Exact RAWG URL → numeric identity resolution.
- Quick Import from pasted titles/provider URLs with review; canonical CSV import/export; human-readable Markdown export.
- Explicit `npm run providers:smoke` live-provider probe that is not part of routine CI.
- SQLite storage and S3-compatible disaster-recovery backup.

## Providers

- **AniList** — anime/donghua; MAL URLs resolve through AniList's MAL mapping.
- **TMDB** — movies and TV; requires `TMDB_API_TOKEN`.
- **Open Library** — books.
- **RAWG** — games when `RAWG_API_KEY` is configured.
- **Wikidata** — bounded localized search assistance only, never canonical identity.

Provider HTTP requests have application-owned deadlines. Rate limits and temporary upstream failures become visible retry-later metadata states; there are no automatic retry loops, provider queues, or image proxies. Provider APIs remain because exact identity, revalidation, TV season structure, page counts, covers, and provider URLs are useful list metadata.

## Entry paths

Normal Add is category → canonical provider search → exact selection → immediate local save → durable exact enrichment.

Quick Import accepts one title or supported provider URL per line and stages candidates for review. The Import / Export page includes a copyable GPT-5.6 helper prompt for extracting paste-ready lines from messy documents. Canonical CSV is the strict provider-ID round-trip format when user state must be preserved. Markdown export is for human-readable archival.

## Local development

Requirements: Node.js 24.15+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run admin:create -- admin 'use-a-long-local-password'
npm run dev
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run providers:smoke   # explicit live provider check; uses configured credentials
```

The main configuration surface is [.env.example](.env.example). Production credentials stay outside this repository.

## Docker Compose

The repository is independently deployable:

```bash
git clone https://github.com/karle0wne/media-list.git
cd media-list
cp .env.example .env
# Edit .env.
docker compose up -d --build
docker compose exec app npm run admin:create -- admin 'use-a-long-local-password'
```

Compose applies pending migrations before starting Next.js. SQLite lives at `./data/media-list.db` by default. Production automation may set `APP_IMAGE` to an immutable registry digest and use the same Compose contract without rebuilding on the host.

## Database and maintenance

Generate schema migrations with `npm run db:generate`; apply them with `npm run db:migrate`. The migration entrypoint also carries the repository's compatibility cleanup for legacy schema columns.

Routine application-owned commands are `npm run cleanup`, `npm run maintenance`, and `npm run metadata:refresh`.

## Backup and restore

The application owns SQLite backup/restore correctness while an external control plane may decide when to invoke it. `npm run backup` writes one validated recovery object, `<S3_PREFIX>latest/media-list.db`; there is no application-managed PITR/history policy.

`npm run restore` materializes that recovery object. A confirmed S3/R2 `NoSuchKey` is first bootstrap; authentication, bucket, network, configuration, and other storage failures fail closed. Deployment rollback is a separate local transaction using `npm run snapshot -- /data/pre-deploy.db` and `npm run restore:local -- /data/pre-deploy.db`.

## Runtime contract

`GET /api/health` verifies database access and returns `APP_REVISION`. Production data, SQLite files, backups, exports, credentials, and tokens must never be committed.
