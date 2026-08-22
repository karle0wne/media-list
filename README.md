# media-list

`media-list` is a small self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is designed to feel like editing a personal list on one low-resource VPS, not operating a content platform.

Provider identity is canonical identity: `external_source + external_id + external_sub_id`. Shared provider metadata is stored once; status, score, medium-specific progress, and notes remain private per user. External provider failures never invalidate the saved list.

See [docs/SPEC.md](docs/SPEC.md) for product invariants and [docs/INTERACTION-DESIGN.md](docs/INTERACTION-DESIGN.md) for the durable UI structure.

## Capabilities

- Central OIDC SSO transition with stable external subject binding and service-scoped `ADMIN` / `USER` roles.
- Existing invite/password/magic-link paths retained temporarily as migration fallback until production SSO is proven.
- AniList anime/donghua, TMDB movies/TV, Open Library books, and RAWG games.
- TV seasons as separate positions using `TMDB series id + season:N`.
- Dense MAL-inspired Catppuccin table: row-first inline editing for status/score/progress/notes, sortable/configurable columns, filters, and user-scoped bulk removal.
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

## Entry and account paths

Normal Add is category → canonical provider search → exact selection → immediate local save → durable exact enrichment. Quick Import accepts one title or supported provider URL per line and stages candidates for review. Canonical CSV is the strict machine round trip; Markdown export is human-readable archival.

Authentication is migrating to shared infrastructure IAM/SSO. When `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ADMIN_ROLE`, `OIDC_USER_ROLE`, and public `APP_BASE_URL` are configured, `/login` presents central SSO as the primary path. The application uses the standard OpenID Connect Authorization Code flow with PKCE, state, and nonce validation.

Central IAM owns identity, whether the identity may access `media-list`, and the service-scoped role. `media-list` owns only domain authorization: what `ADMIN` and `USER` may do with media data. A `media-list` admin role does not imply administration of any other service.

During the migration phase, the first successful OIDC login must match an existing active local user by verified email. The application then persists the stable OIDC `sub` and uses that subject for subsequent identity binding; email is not the durable identity key. Unknown identities fail closed. The IAM role refreshes the local effective `ADMIN` / `USER` role.

The old registration-invite, username/password, password-recovery, admin-assigned email, and Brevo magic-link implementation remains only as a rollback/fallback surface until real production SSO has been proven. It is not the target account model and should be removed in a later bounded change after successful IAM rollout.

## Local development

Requirements: Node.js 24.15+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run admin:create -- admin 'use-a-long-local-password'
npm run dev
```

The local admin/password bootstrap remains available during the transition and is useful when no OIDC provider is configured.

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
# Edit .env.
docker compose up -d --build
docker compose exec app npm run admin:create -- admin 'use-a-long-local-password'
```

Compose applies pending migrations before starting Next.js. SQLite lives at `./data/media-list.db` by default. Production automation may set `APP_IMAGE` to an immutable registry digest and use the same Compose contract without rebuilding on the host.

## Database and maintenance

Generate schema migrations with `npm run db:generate`; apply them with `npm run db:migrate`. The migration entrypoint also owns bounded compatibility cleanup for legacy columns and auth-transition identity columns. Routine commands are `npm run cleanup`, `npm run maintenance`, and `npm run metadata:refresh`.

## Backup and restore

The application owns SQLite backup/restore correctness while an external control plane may decide when to invoke it. `npm run backup` writes one validated recovery object, `<S3_PREFIX>latest/media-list.db`; there is no application-managed PITR/history policy. `npm run restore` materializes that object. A confirmed S3/R2 `NoSuchKey` is first bootstrap; other storage failures fail closed.

## Runtime contract

`GET /api/health` verifies database access and returns `APP_REVISION`. Production data, SQLite files, backups, exports, credentials, auth transaction values, and identity-provider secrets must never be committed.
