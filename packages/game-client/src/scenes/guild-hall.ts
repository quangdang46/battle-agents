/**
 * The Guild Hall: M6.
 *
 * Plan section 25 puts it in this bead's scope; DESIGN.md section 4 places it at
 * M6 and notes the map editor that belongs inside it is owned by
 * `ba-feature-guild-5g6`. Neither is built here. What is built is the scene
 * config and the zone placement, so that when the feature lands the surface
 * exists to receive it rather than the feature inventing a fourth screen.
 */

import { GUILD_HALL, type SceneConfig } from './scene-config.js';

export const guildHallScene: SceneConfig = GUILD_HALL;
