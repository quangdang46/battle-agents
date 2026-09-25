import { ACTION_ID_PATTERN } from './actions.js';
import type { CommandHandler } from './command.js';
import type { ActionDef, Capability, EventHandler, GameFeature } from './contracts.js';

/**
 * What a caller learns about one action without being handed the full catalog.
 *
 * Permissions come along because every surface needs them to decide whether the
 * caller may run the action, and a surface that has to look each one up
 * separately will eventually forget to.
 */
export interface ActionSummary {
  readonly id: string;
  readonly permissions: readonly string[];
  /**
   * What the action does, in a sentence a caller can act on.
   *
   * Optional because this is the frozen contract and adding a required field
   * would break every action declaration already written. It is here because a
   * surface asked to describe an operation with nothing to describe is either
   * useless or dishonest, and an action that omits it is saying so rather than
   * having a description invented for it.
   */
  readonly description?: string;
}

/** The domain an id belongs to, which is everything before its first dot. */
function idOf(id: string): { domain: string } {
  const separator = id.indexOf('.');
  return { domain: separator === -1 ? id : id.slice(0, separator) };
}

/**
 * A handler as the registry holds it, tagged with the feature that registered
 * it.
 *
 * The owner tag is what makes removal correct. Removing by comparing handler
 * references looks equivalent and is not: two features may legitimately share
 * one handler object, the list then holds that same reference twice, and
 * filtering it out uninstalls both registrations — silently switching off a
 * feature nobody asked to remove.
 */
interface RegisteredHandler {
  readonly featureId: string;
  readonly handler: EventHandler;
}

/**
 * Everything the runtime knows about what is installed: which command is
 * handled where, which action runs what, which capability is provided, and who
 * is still missing something.
 *
 * This is the whole of the extension registry. It is an instance rather than
 * module state so two runtimes in one process (two tests, or a host embedding
 * two worlds) cannot see each other's features.
 *
 * A feature is treated as immutable once installed. Uninstall reads the
 * feature object itself to learn what to undo, so there is no second copy of
 * the same list that could drift from the first.
 */
export class FeatureRegistry {
  readonly #commands = new Map<string, CommandHandler>();
  readonly #actions = new Map<string, ActionDef>();
  readonly #capabilities = new Map<string, string>();
  readonly #declaredCapabilities: Capability[] = [];
  readonly #handlers = new Map<string, RegisteredHandler[]>();
  readonly #persistedEventTypes = new Set<string>();
  readonly #features = new Map<string, GameFeature>();

  register(feature: GameFeature): void {
    this.#assertAvailable(feature);
    for (const command of feature.commands ?? []) {
      this.#commands.set(command.type, command);
    }
    for (const action of feature.actionDefs ?? []) {
      this.#actions.set(action.id, action);
    }
    for (const capability of feature.capabilities ?? []) {
      this.#capabilities.set(capability.name, feature.id);
      this.#declaredCapabilities.push(capability);
    }
    for (const handler of feature.eventHandlers ?? []) {
      const existing = this.#handlers.get(handler.on);
      const owned: RegisteredHandler = { featureId: feature.id, handler };
      if (existing === undefined) {
        this.#handlers.set(handler.on, [owned]);
      } else {
        existing.push(owned);
      }
    }
    for (const eventType of feature.persistedEvents ?? []) {
      this.#persistedEventTypes.add(eventType);
    }
    this.#features.set(feature.id, feature);
  }

  unregister(id: string): boolean {
    const feature = this.#features.get(id);
    if (feature === undefined) {
      return false;
    }
    for (const command of feature.commands ?? []) {
      this.#commands.delete(command.type);
    }
    for (const action of feature.actionDefs ?? []) {
      this.#actions.delete(action.id);
    }
    for (const capability of feature.capabilities ?? []) {
      this.#capabilities.delete(capability.name);
    }
    for (const declared of feature.capabilities ?? []) {
      const at = this.#declaredCapabilities.indexOf(declared);
      if (at !== -1) {
        this.#declaredCapabilities.splice(at, 1);
      }
    }
    this.#detachHandlers(id);
    for (const eventType of feature.persistedEvents ?? []) {
      this.#persistedEventTypes.delete(eventType);
    }
    this.#features.delete(id);
    return true;
  }

  commandHandler(type: string): CommandHandler | undefined {
    return this.#commands.get(type);
  }

  action(id: string): ActionDef | undefined {
    return this.#actions.get(id);
  }

  /**
   * A snapshot, not the live list.
   *
   * A handler that installs a feature while the event it is handling is being
   * delivered would otherwise push onto the array this caller is iterating and
   * hand the new feature an event that was already in flight. A feature
   * registered mid-dispatch takes effect on the next event, which is the only
   * order a reader can predict.
   */
  handlersFor(eventType: string): readonly EventHandler[] {
    return (this.#handlers.get(eventType) ?? []).map((owned) => owned.handler);
  }

  commandTypes(): string[] {
    return [...this.#commands.keys()].sort();
  }

  actionIds(): string[] {
    return [...this.#actions.keys()].sort();
  }

  capabilityNames(): string[] {
    return [...this.#capabilities.keys()].sort();
  }

  /**
   * The first segment of every capability and action id, sorted and deduped.
   *
   * Ids are dotted with at least two segments (defineAction rejects anything
   * else), so the first segment is always a domain and never a bare verb.
   */
  domains(): string[] {
    const names = new Set<string>();
    for (const id of [...this.#capabilities.keys(), ...this.#actions.keys()]) {
      names.add(idOf(id).domain);
    }
    return [...names].sort();
  }

  capabilitiesIn(domain: string): Capability[] {
    return this.#declaredCapabilities.filter(
      (capability) => idOf(capability.name).domain === domain,
    );
  }

  actionsIn(domain: string): ActionSummary[] {
    return [...this.#actions.values()]
      .filter((action) => idOf(action.id).domain === domain)
      .map((action) => ({
        id: action.id,
        permissions: [...action.permissions],
        // Spreading rather than a bare undefined: the field is optional, and
        // `exactOptionalPropertyTypes` is on, so an explicit undefined would
        // not type.
        ...(action.description === undefined ? {} : { description: action.description }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /**
   * Only what features declared. The platform-wide half of the policy lives in
   * `isPersistedEventType`, so there is one function to change and not two
   * that have to be kept in agreement.
   */
  persistedEventTypes(): ReadonlySet<string> {
    return this.#persistedEventTypes;
  }

  /**
   * Which installed features are missing a capability they declared.
   *
   * Computed from everything currently installed and recomputed after every
   * install and uninstall, never once at construction. Checking the
   * constructor array alone means a feature installed later is never checked,
   * and checking each feature the instant it registers means a feature ordered
   * before its provider is falsely reported as degraded. Both mistakes poison
   * this one signal, which is supposed to mean "something is genuinely
   * missing": a false positive teaches readers to ignore it, and the removal
   * test reads it as proof the architecture holds.
   */
  missingRequirements(): Map<string, string[]> {
    const missing = new Map<string, string[]>();
    for (const [id, feature] of this.#features) {
      const unmet = (feature.requires ?? []).filter((name) => !this.#capabilities.has(name));
      if (unmet.length > 0) {
        missing.set(id, unmet);
      }
    }
    return missing;
  }

  /**
   * Every check runs before the first mutation, so a feature that collides on
   * its last declaration leaves the registry exactly as it found it instead of
   * half-installed.
   */
  #assertAvailable(feature: GameFeature): void {
    const existingOwner = this.#features.get(feature.id);
    if (existingOwner !== undefined) {
      throw new Error(`feature ${feature.id} is already installed`);
    }
    for (const command of feature.commands ?? []) {
      this.#assertFree(this.#commands, command.type, 'command', feature.id);
    }
    for (const action of feature.actionDefs ?? []) {
      this.#assertFree(this.#actions, action.id, 'action', feature.id);
      // ActionDef documents two rules the type system cannot enforce, because
      // `id` is a string and `permissions` a string array. Capabilities were
      // checked here and actions were not, so a feature could register a bare
      // verb like "read" or declare an action nobody is ever authorised to run.
      // `domains()` derives from the first segment, so an undotted id also
      // makes that method lie the same way an unnamespaced capability did.
      if (!ACTION_ID_PATTERN.test(action.id)) {
        throw new Error(
          `action id must be dotted, lowercase and have at least two segments, ` +
            `got "${action.id}" from ${feature.id}`,
        );
      }
      if (action.permissions.length === 0) {
        throw new Error(
          `action "${action.id}" from ${feature.id} declares no permissions, so no surface ` +
            `could authorise a caller to run it`,
        );
      }
    }
    for (const capability of feature.capabilities ?? []) {
      // Capabilities are namespaced for the same reason actions are: two
      // features both offering a bare "read" would merge into one domain in the
      // catalog, and the collision would only be visible as a missing entry
      // somewhere downstream. Validating here also makes `domains()` true to
      // its comment, which it was not while capability names were free-form.
      if (!ACTION_ID_PATTERN.test(capability.name)) {
        throw new Error(
          `capability name must be dotted, lowercase and have at least two segments, ` +
            `got "${capability.name}" from ${feature.id}`,
        );
      }
      const owner = this.#capabilities.get(capability.name);
      if (owner !== undefined) {
        throw new Error(
          `duplicate capability ${capability.name} claimed by ${feature.id} and ${owner}`,
        );
      }
    }
    for (const eventType of feature.persistedEvents ?? []) {
      if (this.#persistedEventTypes.has(eventType)) {
        throw new Error(`duplicate persisted event type ${eventType} claimed by ${feature.id}`);
      }
    }
    this.#assertFeatureSelfConsistent(feature);
  }

  /**
   * A feature that claims the same name twice would register once and uninstall
   * once, so the second claim would be silently ignored. That is a declaration
   * bug in the feature, and it is cheaper to reject here than to debug later.
   */
  #assertFeatureSelfConsistent(feature: GameFeature): void {
    for (const [label, names] of [
      ['command', (feature.commands ?? []).map((command) => command.type)],
      ['action', (feature.actionDefs ?? []).map((action) => action.id)],
      ['capability', (feature.capabilities ?? []).map((capability) => capability.name)],
      ['persisted event type', feature.persistedEvents ?? []],
    ] as const) {
      const seen = new Set<string>();
      for (const name of names) {
        if (seen.has(name)) {
          throw new Error(`feature ${feature.id} declares ${label} ${name} twice`);
        }
        seen.add(name);
      }
    }
  }

  #assertFree<T>(map: Map<string, T>, key: string, kind: string, featureId: string): void {
    if (map.has(key)) {
      throw new Error(`duplicate ${kind} ${key} from feature ${featureId}`);
    }
  }

  #detachHandlers(featureId: string): void {
    for (const [eventType, owned] of this.#handlers) {
      const remaining = owned.filter((entry) => entry.featureId !== featureId);
      if (remaining.length === owned.length) {
        continue;
      }
      if (remaining.length === 0) {
        this.#handlers.delete(eventType);
      } else {
        this.#handlers.set(eventType, remaining);
      }
    }
  }
}
