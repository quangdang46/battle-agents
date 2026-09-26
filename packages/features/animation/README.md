# `@battle-agents/animation`

A minimal skeletal runtime, and the seam a renderer draws through.

Plan section 25 puts the spike behind one file — _engine emits Pose, renderer
consumes_ — and this package is that split made structural rather than
conventional.

## What it is

Five stages, in this order, and nothing else:

```
sample locals  →  forward kinematics  →  inverse kinematics
               →  mesh skinning  →  region transform  →  Pose
```

The order is not tidiness. IK has to precede both attachment stages because an
attachment inherits its bone's transform, and an attachment placed before the
solve is attached to a hip that then moves under it.

| Module           | Responsibility                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `pose.ts`        | **The seam.** The `Pose` a renderer receives, and a request to make one. Imports nothing.        |
| `skeleton.ts`    | The authored rig: bones, slots, attachments, IK constraints, animations. Validates id integrity. |
| `sampling.ts`    | A moment in an animation, as one local frame per bone.                                           |
| `fk.ts`          | Local frames to world transforms, parents first.                                                 |
| `ik.ts`          | Two-bone IK. **The only importer is `evaluate.ts`.**                                             |
| `skinning.ts`    | Linear blend skinning against a bind pose.                                                       |
| `regions.ts`     | A rectangle of art, placed in its bone's space.                                                  |
| `evaluate.ts`    | The pipeline. The one module that reaches every stage.                                           |
| `render.ts`      | A `Pose` to a `DrawList`. Depends on `pose.ts` and nothing else.                                 |
| `agent-state.ts` | The five agent states, the five animations, and a refusal.                                       |
| `feature.ts`     | The runtime surface: one capability, one action.                                                 |

## The two properties worth keeping

**The renderer cannot solve IK.** `pose.ts` imports nothing, `render.ts`
imports only its types, and `ik.ts` is imported by exactly one module. So a
renderer has no path to the solver, the rest poses or the channel sampler — not
by convention, but because the code does not exist on its side of the boundary.
A renderer that solved IK would look identical on screen and would destroy the
guarantee that an editor and a player can share a core, because the second
consumer of a pose could then disagree with the first.
`tests/unit/animation-core-boundaries.test.ts` reads the module graph to hold
this, and fails if `ik.ts` ever gains a second importer or the barrel re-exports
it as a value.

**Bones are identified by stable ids, never by names.** Every link in the data
model is an id: a bone's parent, a slot's bone and attachment, a channel's bone,
a constraint's joints. Names are carried for tools and nothing reads them.
`golden-frames.test.ts` renames every bone in the rig — to numeric strings, to a
name that collides with another bone's id, to duplicates — and requires a
byte-identical frame.

## Capabilities

| Name             | What it offers                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `animation.pose` | Evaluate a named rig at a moment; receive finished geometry. Same string as the action id and the permission it requires, because this package has exactly one operation. |

## Actions

| Id               | Input                                                           | Output           |
| ---------------- | --------------------------------------------------------------- | ---------------- |
| `animation.pose` | `{ skeletonId, animationId, atMs, boneOverrides?, ikTargets? }` | A `PoseSnapshot` |

Requests are keyed by **stable id**. A request naming a bone instead would make a
cosmetic change to the rig a change to every frame.

## The agent-state mapping

Plan section 9.2: agent state selects an animation.

| State      | Animation  |
| ---------- | ---------- |
| `reading`  | `reading`  |
| `testing`  | `terminal` |
| `failed`   | `damage`   |
| `fixed`    | `victory`  |
| `battling` | `attack`   |

`AGENT_STATE_ANIMATION` is exhaustive over the five states by construction, and
`animationForState` **refuses** anything else rather than falling back to a
generic clip — a fallback makes an unmapped state look handled, and the gap then
surfaces only when a particular agent reaches that particular state.

## What is deliberately absent

No editor, keyframe authoring, undo, revision counter, serializer, physics,
scheduler, WebGL, or knowledge of what a texture is. The reference study behind
this spike is impressive and is also a full authoring product with checkpoints
and observation tooling; building that here serves no milestone in this plan.
The runtime half is the half a game client needs.

**No event handlers either.** Plan section 24 describes this feature as
subscribing to every visual event and projecting `GameState → AnimationState →
Pose` frames. That is the shape it grows into and not what ships, because the
storage half has nothing reading it: `packages/game-client` builds its world from
the event stream directly, and it is forbidden from importing a feature
(`packages/game-client/src/game/architecture.test.ts`). A handler writing poses
nobody reads would make the feature look integrated with every gate green.
`feature.test.ts` asserts the absence so the decision stays visible.

## Removability

Plan section 24: a **consumer** with zero game logic, and removing it must leave
the game fully playable. `tests/unit/animation-removability.test.ts` settles
both halves — playable, and _correct_ — by showing the feature is not in the
transitive closure of the game client or of any other feature, and that it
carries no other feature's vocabulary. It is a static-graph proof rather than a
filesystem removal, and the file says so and says why.

## Fixtures and goldens

`fixtures/agent-rig.ts` is a named 16px character: eleven bones, two
independently-rooted legs each under an IK constraint, a deforming scarf mesh,
and the five animations the state map selects. `goldens/agent-16.json` holds a
committed snapshot of that rig at five named poses, compared exactly.

The rig's numbers are written out in the file's header — where each bone stands
at rest, why the legs are 7 long and the hip 6 above the ground, why the bend
directions are opposite — so a golden can be checked by reading rather than only
by re-running the evaluator.

## Next

Wiring this into the composition root is a separate decision, and it is not this
bead's: `apps/web/src/composition.ts` is where a feature gets installed, and
doing that means the client reaches poses through the Application API rather than
by importing a feature. `packages/game-client`'s architecture test forbids the
import today, deliberately, and changing that is a change somebody should make
on purpose and defend.
