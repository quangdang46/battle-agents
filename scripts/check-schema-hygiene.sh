#!/usr/bin/env bash
# Schema hygiene gate.
#
# Section 29.1 and section 38 treat one rule as load bearing rather than
# stylistic: a session belongs to an Agent, and a credential is stored as a
# hash, never as anything that could be replayed. A plaintext token column in
# the shipped database is the failure this project cannot have.
#
# Why this is a script and not a test. Mutation testing showed a test can be
# deleted along with the constant it uses, after which db:generate, a committed
# migration, and the entire pipeline all pass with a live access_token column
# sitting in agent_credentials. seed and schema-drift both passed, because they
# guard migration-to-schema AGREEMENT, not credential HYGIENE: the column was a
# perfectly consistent, perfectly valid migration.
#
# So the check lives where deleting a test file does not remove it, it reads the
# committed artefacts that actually ship, and it runs as its own pipeline stage.
#
# Scope note: it reads both the schema source and the generated migrations,
# because either one alone leaves a gap. Source-only misses a column that was
# added directly to a migration. Migrations-only misses a source edit that has
# not been generated yet, which is exactly the drift the schema-drift stage
# catches, but a defence that depends on another stage having run first is not
# a defence.

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

readonly SCHEMA_SOURCE_DIR="${REPO_ROOT}/drizzle/schema"
readonly MIGRATION_DIR="${REPO_ROOT}/drizzle/migrations"

# Tables whose columns are held to the credential standard.
readonly GUARDED_TABLES=(
  "agent_credentials"
  "agentCredential"
  "users"
  "installations"
)

# A column is credential-shaped if its name smells like a secret. Matching on
# shape rather than a fixed word list is deliberate: a list that missed
# "access_token" is the same list that would miss "apiKey" or "bearer_value".
readonly SECRET_COLUMN_PATTERN='(token|secret|password|passwd|api_?key|apikey|credential|authorization|bearer|private_?key)'

# The only credential-shaped columns allowed to exist, and only as a hash.
readonly ALLOWED_HASH_COLUMNS=(
  "token_hash"
)

list_guard_declarations() {
  # Drizzle source declares a column as name('db_column_name') inside a table
  # constant. Only the guarded tables are scanned, so a column called "quest_key"
  # on some future table does not trip this.
  local table
  for table in "${GUARDED_TABLES[@]}"; do
    awk -v table="pgTable = ${table}" -v pattern="${SECRET_COLUMN_PATTERN}" '
      index($0, table) { inside = 1 }
      inside && /pgTable\(/ { depth = 1 }
      inside {
        if (match($0, /[a-zA-Z_]+: [a-z]+\(.[a-z_]+./)) {
          line = $0
          while (match(line, /[a-zA-Z_]+: [a-z]+\(.[a-z_]+/)) {
            fragment = substr(line, RSTART, RLENGTH)
            if (tolower(fragment) ~ tolower(pattern)) {
              col = fragment
              sub(/.*\(.\x27?/, "", col)
              sub(/\x27?.*/, "", col)
              print FILENAME ":" col
            }
            line = substr(line, RSTART + RLENGTH)
          }
        }
        if (inside && /\)\);/) { inside = 0 }
      }
    ' "${SCHEMA_SOURCE_DIR}"/*.ts 2>/dev/null || true
  done
}

list_migration_columns() {
  # Committed SQL is the artefact that reaches a database, so it is scanned
  # directly. The statements drizzle-kit emits are regular: an added column is
  # ALTER TABLE "t" ADD COLUMN "c" type, and a created table lists its columns
  # inline. Anything looser, such as "any quoted word on a line mentioning the
  # table", matches index names and the table name itself and drowns the signal.
  local sql table
  for sql in "${MIGRATION_DIR}"/*.sql; do
    [ -e "${sql}" ] || continue
    for table in "${GUARDED_TABLES[@]}"; do
      TABLE="$table" perl -ne 'while (/ALTER\s+TABLE\s+"?\Q$ENV{TABLE}\E"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi) {
                 print "$ARGV:$1\n";
               }' "$sql" 2>/dev/null || true
      TABLE="$table" perl -ne 'if (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\Q$ENV{TABLE}\E"?\s*\((.*)/i) {
                 $body = $1;
                 while ($body =~ /"([A-Za-z0-9_]+)"\s+(?:text|varchar|uuid|integer|bigint|boolean|timestamp|jsonb|serial)/gi) {
                   print "$ARGV:$1\n";
                 }
               }' "$sql" 2>/dev/null || true
    done
  done
}

is_allowed_hash() {
  local column="$1" allowed
  column="$(printf '%s' "$column" | tr '[:upper:]' '[:lower:]')"
  for allowed in "${ALLOWED_HASH_COLUMNS[@]}"; do
    if [ "$column" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

declare -a offenders=()

while IFS= read -r declaration; do
  [ -n "$declaration" ] || continue
  file_path="${declaration%%:*}"
  column="${declaration##*:}"
  if ! is_allowed_hash "$column"; then
    offenders+=("${file_path}: credential-shaped column '${column}' in a guarded table")
  fi
done < <({ list_guard_declarations; list_migration_columns; } | sort -u)

if [ ${#offenders[@]} -gt 0 ]; then
  printf 'schema hygiene FAILED. %d credential-shaped column(s) in a guarded table:\n' "${#offenders[@]}"
  for offender in "${offenders[@]}"; do
    printf '  %s\n' "$offender"
  done
  cat <<'EXPLANATION'

A credential is stored as a hash and nothing else. A column that looks like it
holds a token, key, password or bearer value is only acceptable if it is the
hash column, because anything else in that table is a secret at rest waiting to
leak through a backup, a replica, or a careless log line.

If you genuinely need a new field here, name it for what it is and prove it
carries no secret. Do not add it to the allowlist to make this gate quiet.
EXPLANATION
  exit 1
fi

printf 'schema hygiene: no plaintext credential columns in guarded tables.\n'
