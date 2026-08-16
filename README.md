# media-list

A small invite-only self-hosted media tracker for anime/donghua, movies, TV seasons, and books. It is built for a few known users on one low-resource VPS rather than as a public service.

The core rule is that titles are for display and search; identity comes from an external provider ID. Shared media metadata is stored once, while status, score, progress, notes and time are private per user.

## Stack

- Next.js App Router + TypeScript
- SQLite via Node 22 `node:sqlite`
- Drizzle ORM
- Local username/password auth with server-side opaque sessions
- AniList for anime/donghua
- TMDB for movies and TV seasons
- Open Library for books
- Wikidata only as a multilingual resolver fallback for Cyrillic anime titles
- S3-compatible backup scripts (including Cloudflare R2)

See [docs/SPEC.md](docs/SPEC.md) for the product invariants and scope.

## What the MVP does

- Manual provider search and explicit add.
- Tracks `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ON_HOLD`, `DROPPED`, score 0-10, progress and notes.
- Treats each TV season as a separate item (`TMDB series id + season:N`).
- Computes consumed video time from runtime and progress. A manual minute override is available; for books it is the only time metric because reading duration is subjective. Page progress remains separate.
- Invite-only registration with admin enable/disable controls and `MAX_USERS` guard.
- Canonical CSV export/import using provider IDs.
- Quick import from one title or supported provider URL per line, including Cyrillic input; all candidates go through review.
- LLM-assisted migration CSV for messy Word/Excel/text legacy lists; the LLM output is still revalidated and reviewed before it reaches the main list.
- Persistent SQLite plus optional versioned S3-compatible backups.

## Provider configuration

AniList and Open Library do not need an application key for the read-only calls used here. TMDB requires an API Read Access Token. Put it in `TMDB_API_TOKEN`; never commit it.

Supported URLs in Quick Import include:

- `https://anilist.co/anime/<id>`
- `https://myanimelist.net/anime/<id>` (resolved to AniList identity through MAL id)
- `https://www.themoviedb.org/movie/<id>`
- `https://www.themoviedb.org/tv/<id>/season/<n>`
- IMDb title URLs (resolved through TMDB)
- `https://openlibrary.org/works/<id>`

A bare TMDB TV-series URL resolves to season candidates because the service stores seasons, not whole series.

## Local development

Requirements: Node.js 22.5+.

```bash
cp .env.example .env
npm install
npm run admin:create -- admin 'use-a-long-local-password'
npm run dev
```

Open `http://127.0.0.1:3000` and sign in with the admin account. Create one-time invites from **Users**.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests are intentionally small and focus on agreed invariants: per-user isolation, global provider-ID deduplication, invite/MAX_USERS behavior, and CSV round-trip escaping.

## VPS deployment without a domain

A domain is not required. The default deployment can be opened as `http://SERVER_IP:3000`.

```bash
git clone https://github.com/karle0wne/media-list.git
cd media-list
cp .env.example .env
# Edit .env. At minimum set TMDB_API_TOKEN if you need movies/series.
docker compose up -d --build
docker compose exec app npm run admin:create -- admin 'use-a-long-local-password'
```

Then open `http://SERVER_IP:3000`.

The SQLite file is stored on the host at `./data/media-list.db`. It is ignored by Git. When you later put the service behind HTTPS, set `COOKIE_SECURE=true` and set `APP_BASE_URL` to the public HTTPS URL.

## Invite-only access

There is no public registration endpoint that can create an account without a valid one-time invite. The first admin is created from the command line. An admin can create an invite, disable/enable non-admin users, and disabling a user removes that user's active sessions.

`MAX_USERS=5` is a capacity guard, not a quota/billing system. Lower it to the number of people you actually want on the instance.

## Canonical CSV

Use **Import / Export -> Download my canonical CSV**. The important identity columns are:

```csv
external_source,external_id,external_sub_id,type,title,status,score,progress_current,progress_total,notes,time_spent_override_minutes
ANILIST,1,,ANIME,Cowboy Bebop,COMPLETED,10,26,26,,
TMDB,1396,season:1,SERIES,Breaking Bad — Season 1,COMPLETED,10,7,7,,
```

On import, `title` is not trusted as identity. Provider IDs are queried again before a record is created.

## Quick migration

For a clean old list, paste one line per item:

```text
Во все тяжкие
Атака титанов
Преступление и наказание
https://anilist.co/anime/1
```

The service searches providers, uses a multilingual alias fallback for Cyrillic anime queries, and opens a review screen. Nothing is written to the main list until you select candidates and confirm.

## LLM migration for Word / Excel / messy text

Do not try to make the service parse arbitrary `.docx` or `.xlsx` semantics. Convert the old material externally into a small migration CSV, then upload it to media-list.

A useful prompt is:

> Convert my legacy media list into CSV. Preserve only information that is actually present. Output columns: `type,title,source_url,status,score,progress_current,progress_total,notes,time_spent_override_minutes`. Use `source_url` when you can confidently identify an AniList/MAL/TMDB/IMDb/Open Library item; otherwise leave it empty and keep the original title. Do not invent ratings, progress or URLs. Status values may only be `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ON_HOLD`, `DROPPED`.

Example:

```csv
type,title,source_url,status,score,progress_current,progress_total,notes,time_spent_override_minutes
ANIME,Монстр,,COMPLETED,9,74,74,,
MOVIE,,https://www.themoviedb.org/movie/949,COMPLETED,9,,,,
BOOK,Мастер и Маргарита,,COMPLETED,10,,,,
```

Even provider URLs produced by an LLM are resolved against the real provider and shown on the review screen before import.

## S3 / Cloudflare R2 backups

Configure the `S3_*` variables from `.env.example`, then:

```bash
# Create a transactionally consistent SQLite snapshot and upload a new timestamped object
docker compose exec app npm run backup

# Restore the newest object. Stop the app first so it cannot keep the old DB open.
docker compose stop app
docker compose run --rm app npm run restore
docker compose up -d app

# Or restore a specific object key
docker compose run --rm app npm run restore -- 'media-list/2026-08-16T12-00-00-000Z.db'
```

Backups are additive timestamped objects; the script does not overwrite a single remote file.

## Data and secret policy

This public repository must never contain production data or credentials. `.gitignore` and `.dockerignore` exclude SQLite files, WAL/SHM files, `.env`, CSV exports and backup directories. `.env.example` contains names/placeholders only. Test data is synthetic.

## CI

GitHub Actions runs install, lint, typecheck, the invariant tests, and a production build without production secrets. Provider calls are not used by the test suite.
