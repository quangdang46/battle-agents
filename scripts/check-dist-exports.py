#!/usr/bin/env python3
"""Does every built library export what its source barrel exports?

WHY THIS EXISTS. The web application is the one consumer that does NOT run
against source. Vitest aliases every `@battle-agents/*` to `src/index.ts` --
deliberately, and for the reason in AGENTS.md -- so a test suite cannot tell a
stale build from a fresh one. Next.js resolves the workspace through each
package's `main`/`exports`, which point at `dist`.

So the gate can be entirely green while the application is entirely broken.

That is not hypothetical. `game-client`'s barrel exported `loadSpriteAssets`,
`idlePointer`, `reducePointer`, `assignControlGroup` and `recallControlGroup`.
Its `dist` predated the source. Every test passed, `pnpm build` passed, and the
browser logged five

    Attempted import error: 'loadSpriteAssets' is not exported from
    '@battle-agents/game-client'

and rendered a blank page. `/` -- which is supposed to BE the game -- showed a
sign-in card and no world at all.

WHY SYMBOLS AND NOT TIMESTAMPS. The obvious version of this check is "dist must
be newer than src". It is wrong: `tsc` here is incremental, so when a barrel's
re-export lines are unchanged it rewrites `index.js.map` and leaves `index.js`
alone. `mcp-server` is exactly that case -- correct output, older mtime -- and a
timestamp check can only report it as broken, which is a stage that cries wolf.

WHY PYTHON AND NOT A GREP CHAIN. The first version of this was shell. It passed
against a `dist` I had stripped of the five exports it exists to catch, twice,
for two different reasons: BSD grep has no `\\b`, and the `sed` that was meant
to unwrap `export { ... }` removed the whole line, so the name list was empty
and the loop had nothing to check. A check that cannot fail is worse than no
check, and this one failed silently in the most convincing way available.

Scope: libraries under `packages/`. `apps/web` declares `main: ./dist/index.js`
and has a `dist` directory, and is excluded because its build is `next build`:
it emits `.next/`, and nothing builds or resolves that `dist`.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# `export { a, b, type C }` -- the names worth carrying forward are the ones not
# preceded by `type`. A `type` that failed to re-export breaks `typecheck`,
# which is a stage that already runs and DOES read source. What is missing here
# is value-level breakage, which typecheck cannot see.
NAMES_IN_EXPORT_LIST = re.compile(r"(?<![\w$])type\s+[\w$]+|[\w$]+")
DECLARED_EXPORT = re.compile(
    r"^export\s+(?:declare\s+)?(?:abstract\s+)?"
    r"(?:const|function|class|let|var|async\s+function)\s+([\w$]+)",
    re.MULTILINE,
)
REEXPORTED_BLOCK = re.compile(r"^export\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
# A re-export whose source is another module, e.g.
# `export { a, b } from './x.js'` -- the names still have to reach `dist`.
FROM_CLAUSE = re.compile(r"\}\s*from\s*['\"][^'\"]+['\"]\s*;?\s*$", re.MULTILINE)


def source_exports(barrel: Path) -> set[str]:
    """Every value-level name the source barrel exports."""
    text = barrel.read_text(encoding="utf-8")
    names: set[str] = set()

    for match in DECLARED_EXPORT.finditer(text):
        names.add(match.group(1))

    for block in REEXPORTED_BLOCK.finditer(text):
        body = block.group(1)
        for token in NAMES_IN_EXPORT_LIST.findall(body):
            if token == "type":
                # `type Projection` -- the token after `type` is the real name and
                # is dropped on the next pass, which is the intent.
                continue
            names.add(token)
    return {n for n in names if n not in {"type", "from", "as", "export"}}


def built_declarations(decl: Path) -> str:
    return decl.read_text(encoding="utf-8")


def main() -> int:
    failures: list[tuple[str, list[str]]] = []
    checked = 0

    for manifest_path in sorted(ROOT.glob("packages/*/package.json")):
        package = json.loads(manifest_path.read_text(encoding="utf-8"))
        entry = package.get("main") or ""
        if "./dist/" not in entry:
            continue

        package_dir = manifest_path.parent
        barrel = package_dir / "src" / "index.ts"
        if not barrel.exists():
            continue
        decl = package_dir / "dist" / "index.d.ts"

        name = str(package_dir.relative_to(ROOT))
        if not decl.exists():
            failures.append((f"{name}: no dist/index.d.ts -- never built (pnpm -r build)", []))
            continue

        built = built_declarations(decl)
        missing = sorted(
            symbol
            for symbol in source_exports(barrel)
            if not re.search(rf"(?<![\w$]){re.escape(symbol)}(?![\w$])", built)
        )
        if missing:
            failures.append((f"{name}: exported in src, absent from dist/index.d.ts", missing))
        checked += 1

    for message, missing in failures:
        print(f"FAIL  {message}")
        if missing:
            print(f"      missing -> {', '.join(missing)}")
        print("      consumers resolve this package through dist, so the application")
        print("      runs code the test suite never reads. Rebuild: pnpm -r build")

    if failures:
        print(
            f"dist-exports: FAILED ({len(failures)} packages) -- "
            "a stale build is invisible to every other stage"
        )
        return 1

    print(f"dist-exports: pass  ({checked} packages, every source export present in dist)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
