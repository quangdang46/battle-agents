#!/usr/bin/env bash
# Assert a migration run against a preview database leaves production untouched.
#
# WHY THIS EXISTS. Plan/bead criterion 2 is settled by two assertions because
# either alone is satisfiable by a lie, and the bead says which one matters:
# "a preview wired to the production database satisfies 'each PR gets a preview'
# and corrupts shared data on merge." The wiring can be inspected once. What
# cannot be inspected once is what a MIGRATION RUN does, because a connection
# string is a string and a wrong one is indistinguishable from a right one until
# something writes. This is the thing that cannot be claimed without checking,
# so it is checked by a command with an exit code.
#
# The check is deliberately crude and therefore hard to fool: dump production's
# applied-migration ledger, run the migrations against preview, dump production's
# ledger again, and require the two dumps to be BYTE IDENTICAL. Not "the row
# count is the same" and not "the newest hash is present" — a preview branch that
# applied migration 0021 to production leaves the count changed and the newest
# row wrong, and both of those weaker checks are what a hurried version of this
# would settle for.
#
# WHERE THE LEDGER IS, measured rather than remembered: `drizzle-kit migrate` for
# this project records applied migrations in the `drizzle` schema of whatever
# database DATABASE_URL named — `drizzle.__drizzle_migrations` — NOT in
# `public`, and not in `packages/db/migrations/meta/_journal.json`, which is the
# GENERATION journal and lives in the repository. Both of those are the wrong
# place to look, and the second is wrong in a way that cannot fail: the journal
# is a file, so comparing it across two runs always produces the same bytes and
# always reports success.
#
# Usage:
#   PRODUCTION_DATABASE_URL=… PREVIEW_DATABASE_URL=… bash scripts/check-preview-isolation.sh
#
# The two URLs are read from the environment and never written anywhere. A
# connection string in this file, or in any file, is a secret with a lifetime
# nobody chose.

set -Eeuo pipefail

readonly LEDGER_RELATION='drizzle.__drizzle_migrations'
readonly PRODUCTION_URL_VARIABLE='PRODUCTION_DATABASE_URL'
readonly PREVIEW_URL_VARIABLE='PREVIEW_DATABASE_URL'
readonly JOURNAL='packages/db/migrations/meta/_journal.json'
readonly DRIZZLE_CONFIG='packages/db/drizzle.config.ts'
readonly MIGRATE_COMMAND=(pnpm exec drizzle-kit migrate "--config=${DRIZZLE_CONFIG}")

fail() { printf 'preview-isolation FAILED: %s\n' "$1" >&2; exit 1; }

# How many migrations the tree claims to have, read from the generation journal
# rather than written down here. A literal would be correct on the day it was
# written and wrong after the next migration, and a check that counts against a
# stale constant fails on a healthy tree — which is how guards get switched off.
expected_migrations() {
  local count
  count="$(grep -c '"idx"' "$REPO_ROOT/$JOURNAL" 2>/dev/null || printf '0')"
  printf '%s' "$count"
}

# The identity of the database a URL actually reaches. `pg_database.oid` is
# stable for the life of a database and is what a server distinguishes two
# connections' targets by, so two URLs that differ as STRINGS can still be one
# database — a hostname alias, a copied connection string, a preview left
# pointing at the production branch.
#
# This is the assertion the ledger comparison cannot make on its own. Measured:
# with the preview URL rewritten to a different string that reached the same
# database, the ledger comparison reported SUCCESS, because a fully migrated
# database has nothing left to apply and applying nothing changes nothing. A
# check that only holds while a migration is pending holds on a healthy
# deployment exactly never.
database_identity() {
  local url=$1 label=$2 identity
  if ! identity="$(psql --no-psqlrc --tuples-only --quiet --no-align \
      --set ON_ERROR_STOP=1 --dbname="$url" --command \
      "select current_database() || '@' || (select oid from pg_database where datname = current_database())" 2>&1)"; then
    fail "could not identify the ${label} database: ${identity}"
  fi
  printf '%s' "$identity"
}

# The ledger, as bytes. Ordered by id so a row that moved cannot pass as
# unchanged, and selected column by column so a change of CONTENT cannot hide
# behind an unchanged shape.
ledger_dump() {
  local url=$1 label=$2
  # --dbname, not a PGDATABASE-style variable: the two values arrive as full
  # connection URLs, and psql only understands a URL given as an argument. The
  # first version of this set a `PROD_DATABASE_URL` variable that psql has never
  # heard of, and every run failed by falling back to a local socket.
  psql --no-psqlrc --tuples-only --quiet --no-align \
    --set ON_ERROR_STOP=1 --dbname="$url" --command \
    "select id, hash, created_at from ${LEDGER_RELATION} order by id"
}

require_psql() {
  command -v psql >/dev/null 2>&1 || fail 'psql is not on PATH; this check needs it to read the ledger.'
}

dump_of() {
  local url=$1 label=$2 snapshot
  if ! snapshot="$(ledger_dump "$url" "$label" 2>&1)"; then
    fail "could not read ${LEDGER_RELATION} from the ${label} database: ${snapshot}"
  fi
  if [ -z "$snapshot" ]; then
    fail "the ${label} database has no ${LEDGER_RELATION} at all, so nothing is being compared."
  fi
  printf '%s' "$snapshot"
}

PRODUCTION_URL="${PRODUCTION_DATABASE_URL:-}"
PREVIEW_URL="${PREVIEW_DATABASE_URL:-}"
if [ -z "$PRODUCTION_URL" ] || [ -z "$PREVIEW_URL" ]; then
  printf 'Both %s and %s must be set.\n' "$PRODUCTION_URL_VARIABLE" "$PREVIEW_URL_VARIABLE" >&2
  printf 'Usage: %s=… %s=… bash %s\n' \
    "$PRODUCTION_URL_VARIABLE" "$PREVIEW_URL_VARIABLE" "${BASH_SOURCE[0]}" >&2
  exit 2
fi

if [ "$PRODUCTION_URL" = "$PREVIEW_URL" ]; then
  # Refused rather than reported: this is the exact misconfiguration the check
  # exists to catch, and running it anyway would "pass" by comparing a database
  # with itself — a green result that means nothing.
  fail 'the two URLs are identical. A preview wired to production is the failure this check exists to catch.'
fi

require_psql
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"

APPLIED_MIGRATIONS="$(expected_migrations)"
if [ "$APPLIED_MIGRATIONS" -lt 1 ]; then
  fail "could not read the migration journal at $JOURNAL, so there is nothing to compare against."
fi

printf 'preview-isolation: %s migration(s) in %s, %s as the applied ledger\n' \
  "$APPLIED_MIGRATIONS" "$JOURNAL" "$LEDGER_RELATION"

production_identity="$(database_identity "$PRODUCTION_URL" 'production')"
preview_identity="$(database_identity "$PREVIEW_URL" 'preview')"
printf '  production: %s\n' "$production_identity"
printf '  preview:    %s\n' "$preview_identity"

if [ "$production_identity" = "$preview_identity" ]; then
  fail "the two URLs are different strings that both reach the database $production_identity. A preview wired to production is the failure this check exists to catch, and no amount of migrating it would have revealed it."
fi

before="$(dump_of "$PRODUCTION_URL" 'production')"
printf '  production ledger: %s row(s) before\n' "$(printf '%s\n' "$before" | wc -l | tr -d ' ')"

printf '  running migrations against the preview database\n'
migrate_output="$(DATABASE_URL="$PREVIEW_URL" "${MIGRATE_COMMAND[@]}" 2>&1)" || {
  printf '%s\n' "$migrate_output" >&2
  fail "the migration run against the preview database failed. A preview that cannot migrate is not a preview."
}
printf '  migrations applied against the preview\n'

after="$(dump_of "$PRODUCTION_URL" 'production')"
preview_rows="$(printf '%s\n' "$(ledger_dump "$PREVIEW_URL" 'preview')" | wc -l | tr -d ' ')"

if [ "$before" != "$after" ]; then
  printf 'production ledger BEFORE:\n%s\n' "$before" >&2
  printf 'production ledger AFTER:\n%s\n' "$after" >&2
  fail 'the migration run against the preview CHANGED the production ledger. The preview is wired to production.'
fi

if [ "$preview_rows" -lt "$APPLIED_MIGRATIONS" ]; then
  fail "the preview ledger has $preview_rows row(s) after migrating, expected at least $APPLIED_MIGRATIONS. A migration that silently skipped a file is not isolation."
fi

printf '  production ledger: unchanged, byte for byte\n'
printf '  preview ledger: %s row(s)\n' "$preview_rows"
printf 'preview-isolation: the preview migrated without touching production.\n'
