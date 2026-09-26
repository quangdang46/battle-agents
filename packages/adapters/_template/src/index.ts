/**
 * The adapter template.
 *
 * Adding a coding harness is one subdirectory: copy this, delete what does not
 * apply, and keep the four modules. Nothing in `core/`, `cli/` or `mcp/`
 * changes, and that is the claim the plan makes and this package exists to
 * make true.
 *
 * Read README.md in the package root first. It is the checklist, and the two
 * items people most often get wrong on a first adapter — tool-name
 * normalisation and consent gating — are the two the modules here exist to
 * model.
 *
 * `parser.ts`   translate one harness's records into `AgentEvent`
 * `watcher.ts`  the read, normalise, buffer, post loop
 * `install.ts`  consent gating for a harness that is configured, not watched
 */

export {
  canonicalToolName,
  REQUIRED_EVENT_TYPES,
  type ParsedLine,
  type RawSessionRef,
} from './parser.js';
export { TemplateWatcher, type BatchSender, type WatcherOptions } from './watcher.js';
export {
  applyConsentChoice,
  type ConsentChoice,
  type ConsentDisclosure,
  type InstallerEffects,
  type InstallTarget,
} from './install.js';
