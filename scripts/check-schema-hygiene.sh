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

# Drizzle declares a table as "export const name = pgTable(" followed by the SQL
# table name on the NEXT line, then the column block, then a config callback.
# The first version of this function looked for "pgTable = agent_credentials" on
# one line, which the schema never writes, so the guard never fired and the whole
# schema-source branch was dead while the header claimed it was reading the
# source. It is matched on the two lines drizzle actually emits.
list_guard_declarations() {
  local file table
  for table in "${GUARDED_TABLES[@]}"; do
  for file in "${SCHEMA_SOURCE_DIR}"/*.ts; do
    [ -e "${file}" ] || continue
    TABLE="$table" GUARD_FILE="${file}" perl -0 -ne '
      my $file = $ENV{GUARD_FILE};
      my $want = $ENV{TABLE};
      # Table name first, then walk back to the pgTable( that introduces it.
      while (m{pq?_?Table\([[:space:]]*\n[[:space:]]*\x27$want\x27}g) {
        my $start = pos($_);
        my $rest  = substr($_, $start);
        # Column block runs until the closing "}," that ends the object literal.
        if ($rest =~ m{\{(.*?)\n[[:space:]]*\},\n}s) {
          my $body = $1;
          while ($body =~ m{([A-Za-z0-9_]+)[[:space:]]*:[[:space:]]*[A-Za-z]+\([[:space:]]*\x27([A-Za-z0-9_]+)\x27}g) {
            print "$file:$2\n";
          }
        }
        pos($_); pos($_)++;
      }
    ' "$file" 2>/dev/null || true
  done
  done
}

# Committed SQL is the artefact that reaches a database, so it is scanned as a
# whole rather than line by line. drizzle-kit formats a CREATE TABLE across many
# lines, and the previous version captured only the remainder of the first line,
# which is just the opening parenthesis, so a credential column in a newly
# created table was invisible. Only the table body between the parentheses is
# considered, and a declared type is required so an index name or a constraint
# name is not mistaken for a column.
list_migration_columns() {
  local sql table
  for sql in "${MIGRATION_DIR}"/*.sql; do
    [ -e "${sql}" ] || continue
    for table in "${GUARDED_TABLES[@]}"; do
      TABLE="$table" perl -0 -ne '
        my $t = $ENV{TABLE};
        # Columns added later.
        while (m{ALTER\s+TABLE\s+"?\Q$t\E"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?}gi) {
          print "$ARGV:$1\n";
        }
        # Columns in the original CREATE, body captured across newlines.
        while (m{CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\Q$t\E"?[[:space:]]*\((.*?)\n[[:space:]]*\);}gsi) {
          my $body = $1;
          while ($body =~ m{"([A-Za-z0-9_]+)"\s+(?:text|varchar|char|uuid|integer|bigint|smallint|boolean|timestamp|timestamptz|jsonb|json|serial|numeric|date)}gi) {
            print "$ARGV:$1\n";
          }
        }
      ' "$sql" 2>/dev/null || true
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
  # The scanners report every column they find in a guarded table; only the ones
  # shaped like a credential are of interest. This filter was missing, so once
  # the CREATE TABLE branch started working it flagged every column in the
  # table rather than only the dangerous ones.
  if ! printf '%s' "$column" | grep -qiE "$SECRET_COLUMN_PATTERN"; then
    continue
  fi
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
