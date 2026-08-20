# media-list

`media-list` is a small invite-only, self-hosted tracker for anime/donghua, movies, TV seasons, books, and games. It is designed to feel like editing a personal list on one low-resource VPS, not operating a content platform.

Provider identity is canonical identity: `external_source + external_id + external_sub_id`. Shared provider metadata is stored once; status, score, medium-specific progress, and notes remain private per user. External provider failures never invalidate the saved list.

See [docs/SPEC.md](docs/SPEC.md) for product invariants and [docs/INTERACTION-DESIGN.md](docs/INTERACTION-DESIGN.md) for the durable UI structure.

## Capabilities

- Invite-only local accounts with `MAX_USERS`, optional allowlisted magic-link sign-in, copyable registration links, and separate one-time password-reset links.
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

Admins create new accounts with one-time registration links. An admin may assign one unique email to an existing account; assigned emails are the explicit allowlist for passwordless login. When `BREVO_API_KEY`, a registered and verified Brevo sender in `MAGIC_LINK_FROM`, and public `APP_BASE_URL` are configured, the login page sends a short-lived one-time link through the Brevo transactional-email HTTP API. Unknown emails receive the same generic response and never create a credential. Opening the email URL does not consume the credential; the landing page requires an explicit Continue action so mail-security scanners cannot burn the link.

A custom domain is not an application requirement for this path: the application only requires a verified Brevo sender address. Domain authentication may still improve deliverability, but it is external mail-provider configuration rather than media-list infrastructure.

Password login and password recovery remain independent fallback paths. An admin can create a reset link for an existing user. A locked-out operator can recover the admin account from the trusted runtime environment:

```bash
npm run admin:create-password-reset -- admin
# or emergency direct rotation:
npm run admin:set-password -- admin 'a-new-long-password'
```

The reset-link command requires `APP_BASE_URL`, prints the one-time URL locally, and does not depend on email delivery.

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

Generate schema migrations with `npm run db:generate`; apply them with `npm run db:migrate`. The migration entrypoint also owns bounded compatibility cleanup for legacy columns, user email identity, password-reset credentials, and magic-login credentials. Routine commands are `npm run cleanup`, `npm run maintenance`, and `npm run metadata:refresh`.

## Backup and restore

The application owns SQLite backup/restore correctness while an external control plane may decide when to invoke it. `npm run backup` writes one validated recovery object, `<S3_PREFIX>latest/media-list.db`; there is no application-managed PITR/history policy. `npm run restore` materializes that object. A confirmed S3/R2 `NoSuchKey` is first bootstrap; other storage failures fail closed.

## Runtime contract

`GET /api/health` verifies database access and returns `APP_REVISION`. Production data, SQLite files, backups, exports, credentials, invite tokens, password-reset tokens, and magic-login tokens must never be committed.
