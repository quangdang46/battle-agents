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

readonly SCHEMA_SOURCE_DIR="${REPO_ROOT}/packages/db/src/schema"
readonly MIGRATION_DIR="${REPO_ROOT}/packages/db/migrations"

# Tables whose columns are held to the credential standard.
readonly GUARDED_TABLES=(
  "agent_credentials"
  "agentCredential"
  "users"
  "installations"
  # Better Auth's own tables. Its account table holds a human's OAuth tokens in
  # plaintext, which is a real secret at rest, so excluding the table would be
  # the one way to make this gate weaker. It is guarded, and the few columns
  # that legitimately hold a provider secret are exempted by table AND column
  # below, so the next credential-shaped column added beside them still fails.
  "user"
  "session"
  "account"
  "verification"
  # The GitHub delivery ledger. It holds no credential today — the columns are
  # a delivery id, a repository, a pull request number and two timestamps — and
  # that is exactly why it belongs on this list rather than being left off it.
  # The temptation this table creates is real and local: it is where somebody
  # debugging an auth failure would add the installation token, and a token
  # stored in a table full of GitHub delivery ids gets shipped in every backup
  # of the application database. The token is read from the environment by
  # packages/infrastructure/github and never persisted.
  "github_delivery_claims"
)

# A column is credential-shaped if its name smells like a secret. Matching on
# shape rather than a fixed word list is deliberate: a list that missed
# "access_token" is the same list that would miss "apiKey" or "bearer_value".
readonly SECRET_COLUMN_PATTERN='(token|secret|password|passwd|api_?key|apikey|credential|authorization|auth|bearer|cookie|private_?key|session_?id)'

# The only credential-shaped columns allowed to exist, and only as a hash.
readonly ALLOWED_HASH_COLUMNS=(
  "token_hash"
)

# table:column pairs that hold a real secret and are exempt, each for a stated
# reason. Table-scoped on purpose: a bare column name in this list would let ANY
# guarded table grow a plaintext 'token', which is the hole this gate closes.
#
#   account:access_token, account:refresh_token, account:id_token
#     The GitHub OAuth tokens for a HUMAN, held by Better Auth because that is the
#     provider contract it implements and nothing in this system reads them. They
#     are not agent credentials: an agent token is ours to issue, hash and revoke,
#     and lives in agent_credentials.token_hash.
#
#   account:password
#     Always null for GitHub OAuth, the only provider this project registers. The
#     column exists because Better Auth's schema requires it for credential
#     providers; a value in it would be a Better Auth credential hash.
#
#   session:token
#     A session cookie value, used as a lookup key rather than as a secret. It is
#     handed to the browser on every request, so hashing it would break lookups
#     without protecting anything the transport does not already.
readonly EXEMPT_SECRET_COLUMNS=(
  "account:access_token"
  "account:refresh_token"
  "account:id_token"
  "account:password"
  "session:token"
  #   account:access_token_expires_at, account:refresh_token_expires_at
  #     Timestamps. The pattern matches them because of the word "token", and
  #     narrowing the pattern to avoid that is exactly the change that made this
  #     gate miss things twice before. A column called "when the token stops
  #     working" carries no more secret than a column called "when it started".
  "account:access_token_expires_at"
  "account:refresh_token_expires_at"
)

# Drizzle declares a table as "export const name = pgTable(" followed by the SQL
# table name on the NEXT line, then the column block, then a config callback.
# The first version of this function looked for "pgTable = agent_credentials" on
# one line, which the schema never writes, so the guard never fired and the whole
# schema-source branch was dead while the header claimed it was reading the
# source, and then it stayed dead a second time: the first repair used
# "pq?_?Table" where drizzle emits "pgTable", so it matched nothing again. The
# pattern is now pg_?Table and the branch is verified by a mutation, not by
# reading it back. A comment about a scanner is a claim, and a claim is only
# evidence once something has tried to break it.
list_guard_declarations() {
  local file
  # One perl per FILE, not per (table, file).
  #
  # The tables used to be the outer loop, which meant GUARDED_TABLES x files
  # process spawns. Windows spawns are expensive enough that the gate took 104
  # seconds of wall time for 9 seconds of CPU — and the gate's own tests time
  # out at 30, so it failed there while the stage itself passed. The table list
  # moves inside perl and every file is read once.
  #
  # The regexes below are the ones that were there. The fix is where the work
  # happens, not what is matched: a scanner that got faster by matching less
  # would be this gate's own history repeating.
  #
  # RECURSIVE, and that is the fix rather than a detail. This used to be a glob
  # of the top level only, so it never opened packages/db/src/schema/features/*
  # — which is where every feature's tables live. A credential column added to
  # a feature schema was therefore invisible here, and the gate printed its pass
  # line having checked nothing about it. Adding github_delivery_claims to
  # GUARDED_TABLES would have been a false claim, and a comment in this file
  # asserting the table is guarded is exactly the kind that has been wrong here
  # before. Found by planting an `installation_token` column in that directory
  # and watching the gate stay green.
  while IFS= read -r -d '' file; do
    GUARD_TABLES="$(printf '%s\n' "${GUARDED_TABLES[@]}")" GUARD_FILE="${file}" perl -0 -ne '
      my $file = $ENV{GUARD_FILE};
      my @want = split /\n/, $ENV{GUARD_TABLES};
      for my $want (@want) {
        # Table name first, then walk back to the pgTable( that introduces it.
        while (m{pg_?Table\([[:space:]]*\n[[:space:]]*\x27\Q$want\E\x27}g) {
          my $start = pos($_);
          my $rest  = substr($_, $start);
          # Column block runs until the closing "}," that ends the object literal.
          if ($rest =~ m{\{(.*?)\n[[:space:]]*\},\n}s) {
            my $body = $1;
            while ($body =~ m{([A-Za-z0-9_]+)[[:space:]]*:[[:space:]]*[A-Za-z]+\([[:space:]]*\x27([A-Za-z0-9_]+)\x27}g) {
              print "$want:$2:$file\n";
            }
          }
          pos($_); pos($_)++;
        }
      }
    ' "$file" 2>/dev/null || true
  done < <(find "${SCHEMA_SOURCE_DIR}" -type f -name '*.ts' -not -path '*/node_modules/*' -print0)
}

# Committed SQL is the artefact that reaches a database, so it is scanned as a
# whole rather than line by line. drizzle-kit formats a CREATE TABLE across many
# lines, and the previous version captured only the remainder of the first line,
# which is just the opening parenthesis, so a credential column in a newly
# created table was invisible. Only the table body between the parentheses is
# considered, and a declared type is required so an index name or a constraint
# name is not mistaken for a column.
list_migration_columns() {
  local sql
  # One perl per migration file, for the same reason as the source scan above:
  # the table list used to be the outer loop, so this was nine spawns per file.
  for sql in "${MIGRATION_DIR}"/*.sql; do
    [ -e "${sql}" ] || continue
    GUARD_TABLES="$(printf '%s\n' "${GUARDED_TABLES[@]}")" perl -0 -ne '
      my @want = split /\n/, $ENV{GUARD_TABLES};
      for my $t (@want) {
        # Columns added later.
        while (m{ALTER\s+TABLE\s+"?\Q$t\E"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?}gi) {
          print "$t:$1:$ARGV\n";
        }
        # Columns in the original CREATE, body captured across newlines.
        while (m{CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\Q$t\E"?[[:space:]]*\((.*?)\n[[:space:]]*\);}gsi) {
          my $body = $1;
          while ($body =~ m{"([A-Za-z0-9_]+)"\s+(?:text|varchar|char|uuid|integer|bigint|smallint|boolean|timestamp|timestamptz|jsonb|json|serial|numeric|date)}gi) {
            print "$t:$1:$ARGV\n";
          }
        }
      }
    ' "$sql" 2>/dev/null || true
  done
}

# Both checks are pure bash rather than `tr | grep`.
#
# They run once per column the scanners emit, and a spawn is ~70ms on Windows:
# three processes per line turned a 6-second scan into a 104-second one, which
# is how the gate's own tests came to time out at 30 seconds while the stage
# itself passed. The matching is identical — the pattern is already lowercase,
# so lowercasing the candidate is what `tr` was doing.
is_allowed_hash() {
  local column="${1,,}" allowed
  for allowed in "${ALLOWED_HASH_COLUMNS[@]}"; do
    if [ "$column" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

is_exempt_secret() {
  local key="${1,,}:${2,,}" entry
  for entry in "${EXEMPT_SECRET_COLUMNS[@]}"; do
    if [ "$key" = "$entry" ]; then
      return 0
    fi
  done
  return 1
}

looks_credential_shaped() {
  # [[ =~ ]] takes an ERE, which is what SECRET_COLUMN_PATTERN already is. The
  # whole value is in a variable rather than a literal so the pattern is not
  # parsed as this script's own syntax.
  local candidate="${1,,}"
  [[ "${candidate}" =~ $SECRET_COLUMN_PATTERN ]]
}

declare -a offenders=()

# The scanners report file:table:column, so the exemption can be scoped to the
# table that earned it. A bare column name would let any guarded table grow a
# plaintext 'token', which is the hole this gate exists to close.
while IFS= read -r declaration; do
  [ -n "$declaration" ] || continue
  # table:column:file, NOT file:table:column. A Windows path begins "C:", so a
  # leading file field makes every split wrong on Windows and the gate silently
  # exempts whatever it misparses. The two leading fields are identifiers and
  # can never contain a colon; only the trailing path can.
  table="${declaration%%:*}"
  rest="${declaration#*:}"
  column="${rest%%:*}"
  file_path="${rest#*:}"
  # The scanners report every column they find in a guarded table; only the ones
  # shaped like a credential are of interest. This filter was missing, so once
  # the CREATE TABLE branch started working it flagged every column in the
  # table rather than only the dangerous ones.
  if ! looks_credential_shaped "$column"; then
    continue
  fi
  if is_allowed_hash "$column" || is_exempt_secret "$table" "$column"; then
    continue
  fi
  offenders+=("${file_path}: credential-shaped column '${column}' in table '${table}'")
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
