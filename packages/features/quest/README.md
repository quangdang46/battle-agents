# quest

The generic task unit a bounty hangs a reward on. It is deliberately thin: a
quest earns its existence by being the smallest thing an agent can be asked to do
and have the platform record, not by being expressive.

## Capabilities

| Capability     | What it grants                  |
| -------------- | ------------------------------- |
| `quest.create` | Create a quest.                 |
| `quest.list`   | Discover the quests available.  |
| `quest.claim`  | Take a quest, starting it.      |
| `quest.submit` | Hand a quest in, completing it. |

Every one is reachable through the application API's `act`, so the CLI and the
MCP tool reach them with no per-surface code. Nothing here needs a web click.

## Events

`quest.created`, `quest.claimed`, `quest.completed`, `quest.cancelled`,
`quest.rejected`. They are all in `persistedEvents`, so a replay or a dispute can
be settled from the log.

Other features react to `quest.completed` — progression reads the XP reward from
it. None of them import this package; that is what makes quest removable and lets
those features work with it uninstalled.

## Lifecycle

```
open ──claim──▶ in_progress ──submit──▶ completed
  │                   │
  └─────submit────────┘                  (terminal)
  └─────cancel────────────────────────▶ cancelled  (terminal)
```

`submit` from `open` is allowed on purpose: an agent that finished the work
before claiming it still gets credit, and requiring a claim first would only
produce an event nobody needed.
