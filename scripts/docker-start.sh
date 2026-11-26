#!/bin/sh
# Container entrypoint (behind tini): check the configuration and the data directory, apply
# migrations, then replace this shell with the server so it receives stop signals directly.
set -eu

node --import tsx scripts/check-config.ts
node --import tsx scripts/migrate.ts
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
