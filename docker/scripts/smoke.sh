#!/bin/sh
# Smoke checks for the Docker local-dev contract (bead ba-docker-local-dev-y28).
#
# Each check is a named function so a failure names itself. Run from anywhere:
#   sh docker/scripts/smoke.sh

set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$REPO_ROOT"

COMPOSE_FILES='-f compose.yaml'
PROBE_TABLE=battle_agents_volume_probe

pass() {
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  exit 1
}

compose() {
  docker compose $COMPOSE_FILES "$@"
}

assert_compose_files_parse() {
  docker compose $COMPOSE_FILES config --quiet || fail 'compose.yaml must parse'
  docker compose $COMPOSE_FILES -f compose.dev.yaml config --quiet \
    || fail 'compose.dev.yaml must parse when layered over compose.yaml'
  pass 'compose files parse'
}

assert_required_services_exist() {
  services=$(docker compose $COMPOSE_FILES --profile test config --services)
  for required in postgres web test-runner; do
    printf '%s\n' "$services" | grep -qx "$required" \
      || fail "compose must define the '$required' service"
  done
  pass 'M0 services present (postgres, web, test-runner profile)'
}

assert_no_early_scale_up_services() {
  services=$(docker compose $COMPOSE_FILES --profile test config --services)
  for deferred in worker queue mcp-server; do
    if printf '%s\n' "$services" | grep -qx "$deferred"; then
      fail "'$deferred' must wait for the section 7.4 scale-up trigger"
    fi
  done
  pass 'no worker/queue/MCP containers added ahead of the scale-up trigger'
}

assert_postgres_data_uses_a_named_volume() {
  volume_name=$(docker compose $COMPOSE_FILES config \
    | sed -n '/^  postgres:/,/^  [a-z]/p' \
    | grep -oE 'agent-battle-postgres-data' \
    | head -1)
  [ "$volume_name" = 'agent-battle-postgres-data' ] \
    || fail 'postgres must persist to the named volume agent-battle-postgres-data'
  pass 'postgres persists to the named volume agent-battle-postgres-data'
}

assert_data_survives_down_and_up() {
  compose up -d postgres >/dev/null 2>&1 || fail 'postgres must start'

  waited=0
  until [ "$(compose ps postgres --format '{{.Health}}' 2>/dev/null)" = 'healthy' ]; do
    [ "$waited" -lt 120 ] || fail 'postgres never reported healthy'
    sleep 2
    waited=$((waited + 2))
  done

  compose exec -T postgres psql -U battle_agents -d battle_agents -q \
    -c "CREATE TABLE IF NOT EXISTS $PROBE_TABLE (id int primary key, note text);" \
    -c "INSERT INTO $PROBE_TABLE (id, note) VALUES (1, 'survives-down-up') ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note;" \
    >/dev/null || fail 'could not write the persistence probe'

  compose down >/dev/null 2>&1 || fail 'compose down must succeed'
  compose up -d postgres >/dev/null 2>&1 || fail 'postgres must restart after down'

  waited=0
  until [ "$(compose ps postgres --format '{{.Health}}' 2>/dev/null)" = 'healthy' ]; do
    [ "$waited" -lt 120 ] || fail 'postgres never reported healthy after restart'
    sleep 2
    waited=$((waited + 2))
  done

  note=$(compose exec -T postgres psql -U battle_agents -d battle_agents -tAc \
    "SELECT note FROM $PROBE_TABLE WHERE id = 1;" 2>/dev/null | tr -d '[:space:]')
  compose exec -T postgres psql -U battle_agents -d battle_agents -q \
    -c "DROP TABLE IF EXISTS $PROBE_TABLE;" >/dev/null 2>&1 || true

  [ "$note" = 'survives-down-up' ] \
    || fail "data did not survive down/up (read '$note')"
  pass 'data survives docker compose down && docker compose up'
}

assert_compose_does_not_leak_into_workspace() {
  # Docker belongs to the infrastructure layer: no package source or manifest
  # may reference compose files or the Postgres container.
  offenders=$(grep -rInE 'compose\.(dev\.)?ya?ml|Dockerfile|agent-battle-postgres-data' \
    apps packages --include='*.ts' --include='*.tsx' --include='*.json' \
    2>/dev/null | grep -v node_modules || true)

  [ -z "$offenders" ] || fail "Docker concepts leaked into the workspace:
$offenders"
  pass 'no Docker/Compose concepts inside apps/ or packages/'
}

main() {
  assert_compose_files_parse
  assert_required_services_exist
  assert_no_early_scale_up_services
  assert_postgres_data_uses_a_named_volume
  assert_compose_does_not_leak_into_workspace
  assert_data_survives_down_and_up

  printf '\nAll Docker local-dev smoke checks passed.\n'
}

main "$@"
