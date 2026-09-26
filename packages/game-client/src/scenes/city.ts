/**
 * The Coding City: the M5 second view.
 *
 * Plan section 25 / DESIGN.md section 3. The city is reached FROM the Bounty
 * Board, which is the first screen; DESIGN.md settles that explicitly and
 * explains why (section 17.1's gimmick trap — a pixel world as the landing inverts
 * the M2 "real utility before heavy art" defense). So this module configures a
 * scene and does not navigate.
 *
 * Its landmarks are the ones DESIGN.md section 4 names: Guild Hall, Research
 * Lab, character, Arena, Workshop, Quest Board. They are zone placements in
 * `zones.ts`, not buildings declared here, which is what keeps a new zone from
 * needing a change in this file.
 */

import { CITY, type SceneConfig } from './scene-config.js';

export const cityScene: SceneConfig = CITY;
