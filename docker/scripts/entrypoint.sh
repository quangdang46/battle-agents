#!/bin/sh
# Container entrypoint for the battle-agents local environment.
#
# The image ships a toolchain only; dependencies live in named volumes so a
# clean clone can reach a running stack without installing Node or Postgres on
# the host. Each mode below owns exactly one job (G30).

set -eu

APP_DIR=/app
DEPS_MARKER=$APP_DIR/node_modules/.battle-agents-deps
HOST_STORE_DIR=$APP_DIR/.pnpm-store

WAIT_TIMEOUT_SECONDS=120
WAIT_INTERVAL_SECONDS=1
IDLE_SLEEP_SECONDS=3600

log() {
  printf '[battle-agents] %s\n' "$1"
}

fail() {
  printf '[battle-agents] ERROR: %s\n' "$1" >&2
  exit 1
}

# The store belongs to a named volume. Finding one in the bind mount means it
# is being written through to the host checkout, so fail loudly instead of
# letting it pollute the repository.
reject_store_in_bind_mount() {
  if [ -d "$HOST_STORE_DIR" ]; then
    fail "$HOST_STORE_DIR is inside the bind mount; pnpm is writing through to the host checkout"
  fi
}

read_package_script() {
  node -e '
    const [manifestPath, scriptName] = process.argv.slice(1);
    const manifest = require(manifestPath);
    const scripts = manifest.scripts ?? {};
    process.stdout.write(scripts[scriptName] ?? "");
  ' "$1" "$2"
}

# Hashes the lockfile together with every workspace manifest: adding a package
# changes the install even when pnpm-lock.yaml is untouched, so hashing the
# lockfile alone would leave the node_modules volume stale.
dependency_fingerprint() {
  find "$APP_DIR/pnpm-lock.yaml" "$APP_DIR/package.json" \
    "$APP_DIR/apps" "$APP_DIR/packages" \
    -name package.json -not -path '*/node_modules/*' 2>/dev/null \
    | sort \
    | xargs sha256sum \
    | sha256sum \
    | cut -d ' ' -f 1
}

dependencies_are_current() {
  [ -f "$DEPS_MARKER" ] || return 1
  [ "$(cat "$DEPS_MARKER")" = "$(dependency_fingerprint)" ]
}

install_dependencies() {
  reject_store_in_bind_mount
  if dependencies_are_current; then
    log 'dependencies already match the workspace, skipping install'
    return 0
  fi
  log 'installing workspace dependencies into the node_modules volume'
  if ! pnpm install --frozen-lockfile; then
    log 'the lockfile does not match the workspace manifests'
    log 'run "pnpm install" on the host to refresh pnpm-lock.yaml, then retry'
    fail 'dependency install failed'
  fi
  reject_store_in_bind_mount
  dependency_fingerprint >"$DEPS_MARKER"
}

wait_for_postgres() {
  log "waiting up to ${WAIT_TIMEOUT_SECONDS}s for postgres"
  waited=0
  until node -e '
    const net = require("node:net");
    const [port, host] = process.argv.slice(1);
    const socket = net.connect(Number(port), host);
    socket.on("connect", () => { socket.end(); process.exit(0); });
    socket.on("error", () => process.exit(1));
  ' "${POSTGRES_PORT:-5432}" "${POSTGRES_HOST:-postgres}" 2>/dev/null; do
    [ "$waited" -lt "$WAIT_TIMEOUT_SECONDS" ] || fail 'postgres did not become reachable'
    sleep "$WAIT_INTERVAL_SECONDS"
    waited=$((waited + WAIT_INTERVAL_SECONDS))
  done
  log 'postgres is reachable'
}

run_optional_script() {
  if [ -z "$(read_package_script "$APP_DIR/package.json" "$1")" ]; then
    log "skipping '$1': the workspace does not define it yet"
    return 0
  fi
  log "running '$1'"
  pnpm run "$1"
}

run_migrations_and_seed() {
  run_optional_script db:migrate
  run_optional_script db:seed
}

run_web_server() {
  manifest=$APP_DIR/apps/web/package.json
  [ -f "$manifest" ] || fail 'apps/web/package.json is missing from the bind mount'

  for candidate in "$@"; do
    if [ -n "$(read_package_script "$manifest" "$candidate")" ]; then
      log "starting apps/web via its '$candidate' script"
      exec pnpm --filter @battle-agents/web run "$candidate"
    fi
  done

  log 'apps/web defines no dev or start script yet (owner: ba-web-ui-surface-t3w)'
  log 'postgres and the test-runner profile remain fully usable in this state'
  log 'holding the container open so the stack stays green'
  while true; do
    sleep "$IDLE_SLEEP_SECONDS"
  done
}

verify() {
  run_migrations_and_seed
  log 'typecheck'
  pnpm typecheck
  log 'lint'
  pnpm lint
  log 'unit tests'
  pnpm test
  # Explicit, not a side effect. This container has migrations applied, a seed
  # loaded and a live Postgres, which is the only place the integration suite
  # can run. It used to execute here by accident, because `pnpm test` pointed at
  # a repository-wide glob; now that `pnpm test` is the unit stage, leaving it
  # out would quietly weaken this profile.
  log 'integration tests'
  pnpm run test:integration
  log 'verification pipeline passed'
}

main() {
  mode=${1:-dev}
  case "$mode" in
    dev)
      install_dependencies
      wait_for_postgres
      run_migrations_and_seed
      run_web_server dev
      ;;
    serve)
      wait_for_postgres
      run_web_server start
      ;;
    verify)
      install_dependencies
      wait_for_postgres
      verify
      ;;
    *)
      fail "unknown mode '$mode' (expected: dev, serve, or verify)"
      ;;
  esac
}

main "$@"
