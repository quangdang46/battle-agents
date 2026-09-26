/**
 * The Arena: the PvP surface.
 *
 * Plan section 25 / DESIGN.md section 4. `bounty.claimed` and the battle
 * lifecycle route here through `ZONE_FOR_EVENT`, so an agent that enters a
 * battle walks to the arena without this file knowing what a battle is.
 *
 * DESIGN.md section 8 also describes arena diff-streaming over WebSocket. That
 * is the replay surface's job, not this one: this scene draws the world, and the
 * event stream already carries the state it draws from.
 */

import { ARENA, type SceneConfig } from './scene-config.js';

export const arenaScene: SceneConfig = ARENA;
