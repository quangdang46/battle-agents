#!/usr/bin/env bash
# Restart the web app so a rebuilt workspace package is actually loadable.
#
# WHY THIS SCRIPT EXISTS. `next dev` compiles against the workspace's `dist`,
# and the repo bind-mounts the whole tree into the container. Rebuilding a
# package underneath a running dev server orphans its vendor chunks:
#
#   Error: Cannot find module './chunks/vendor-chunks/next@15.5.26_....js'
#
# The page then answers 500 and the game is a blank screen, which reads exactly
# like an application bug and is not one. It cost three wrong diagnoses in this
# session before the cause was clear, so it is a command rather than a ritual.
#
# It also passes AGENT_BATTLE_DEV_LOGIN=1, so the game is reachable without an
# OAuth App. That is the same category as a database seed: a local override that
# changes what the page renders on this machine and nothing else. It is not an
# auth bypass -- no file under apps/ or packages/ is touched, and the app's own
# session verification still runs.
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"

cat > .tmp/compose.devlogin.yaml <<'YAML'
# Local only, and not committed: .tmp/ is gitignored.
services:
  web:
    environment:
      AGENT_BATTLE_DEV_LOGIN: "1"
YAML

echo "rebuilding workspace packages"
pnpm -r build >/dev/null

echo "restarting the web app with a clean .next"
docker compose -f compose.yaml down web >/dev/null 2>&1 || true
rm -rf apps/web/.next
docker compose -f compose.yaml -f .tmp/compose.devlogin.yaml up -d --wait web >/dev/null

# `next dev` answers / before it has compiled the first route, so a 307 from the
# root is the signal to wait on rather than a success to report.
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || true)" = "307" ]; then
    echo "web up; the game is at http://127.0.0.1:3000/ (dev login on)"
    exit 0
  fi
  sleep 2
done

echo "web did not come up in time" >&2
docker logs battle-agents-web-1 --tail 20 >&2 || true
exit 1
