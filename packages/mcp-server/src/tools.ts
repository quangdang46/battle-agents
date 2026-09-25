import { PRIMITIVES } from '@battle-agents/api';
import { isRegisteredActionId } from '@battle-agents/protocol';
import { UnknownActionError } from '@battle-agents/api';
import type { ApplicationApi, Primitive } from '@battle-agents/api';
import { z } from 'zod';

/**
 * The MCP surface: the same five primitives the CLI and HTTP expose, and
 * nothing else.
 *
 * The tool list is derived from `PRIMITIVES` rather than written out, because a
 * hand-written list is a second place the surface is defined and the two drift
 * the first time somebody adds one. Deriving it means a sixth primitive is a
 * compile error here instead of a quiet sixth tool at runtime.
 *
 * No per-feature tool modules exist and none may: a feature is reachable because
 * it registered an action, not because somebody wrote a tool for it. That is the
 * difference between a tool list that grows with the game and one that does not.
 */

const domainInput = z.object({
  domain: z.string().min(1).optional().describe('Omit to list top-level domains only.'),
});

const searchInput = z.object({
  type: z.string().min(1).describe('The domain to search within.'),
  name: z.string().min(1).optional().describe('Substring of the operation name.'),
});

const inspectInput = z.object({
  type: z.string().min(1).describe('The domain the id belongs to.'),
  id: z.string().min(1).describe('The operation within that domain.'),
});

const actInput = z.object({
  action: z.string().min(1).describe('A dotted id such as "quest.claim". See discover.'),
  input: z
    .unknown()
    .optional()
    .describe('Arguments for the action, in whatever shape it declares.'),
});

const observeInput = z.object({
  domain: z.string().min(1).optional().describe('Omit to watch every domain.'),
});

/** What a tool is given when it runs, beyond its own arguments. */
export interface ToolContext {
  readonly api: ApplicationApi;
  /**
   * Starts a subscription and returns its id. The server owns these rather than
   * the handler, because an id the caller gets back has to be closable later and
   * a handler that kept the observer to itself would have nowhere to put it.
   *
   * The server also owns delivery: whatever transport is attached receives the
   * events, so the tool does not have to know whether one is.
   */
  subscribe(domain: string | undefined): string;
}

/** A tool, in the shape the MCP server needs to register and call it. */
export interface ToolDefinition<I = unknown> {
  readonly name: Primitive;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  /**
   * JSON Schema for the result, or absent.
   *
   * The MCP spec says a server that declares an outputSchema MUST return
   * structured content conforming to it. That is a promise, not a hint, so the
   * absence here is deliberate for `act` and is explained where it is declared.
   */
  readonly outputSchema?: Record<string, unknown>;
  /** JSON Schema form of inputSchema, which is what goes on the wire. */
  readonly inputJsonSchema: Record<string, unknown>;
  handle(context: ToolContext, input: I): unknown;
}

const describe = (text: string) => ({ description: text });

/**
 * The four primitives whose result shape is knowable at build time, so they can
 * promise a schema and be held to it.
 */
const outputSchemaOf = (schema: z.ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;

const discoverResult = z.object({
  domains: z.array(z.string()).optional(),
  detail: z
    .object({
      capabilities: z.array(z.object({ name: z.string(), description: z.string() })),
      actions: z.array(z.object({ id: z.string(), permissions: z.array(z.string()) })),
    })
    .optional(),
});

const searchResult = z.array(z.object({ id: z.string(), name: z.string() }));
const inspectResult = z.unknown();
const observeResult = z.object({ subscriptionId: z.string() });

/**
 * The tools, keyed by primitive name.
 *
 * `act` deliberately has NO outputSchema. Its result is whatever the called
 * action returns, and the set of actions is decided at runtime by packages that
 * are built and deployed independently — so no type this compiler can see is a
 * function of it. Declaring a permissive `{type: 'object'}` would be worse than
 * declaring none: the spec then reads the promise as a MUST that every caller
 * relies on, and it would be false for every action whose result is an array, a
 * string, or null. The honest answer is that this tool's output is not
 * statically knowable, and a caller who needs the shape reads it from the
 * action's own documentation.
 */
export function createTools(): ReadonlyMap<Primitive, ToolDefinition> {
  const definitions: readonly ToolDefinition[] = [
    defineTool({
      name: 'discover',
      description: describe(
        'List what this platform can do. With no domain, returns domain names only. ' +
          'With one, returns its capabilities and actions. Start here rather than ' +
          'guessing an action id.',
      ).description,
      inputSchema: domainInput,
      outputSchema: outputSchemaOf(discoverResult),
      inputJsonSchema: inputJsonOf(domainInput),
      handle: (context, input) => context.api.discover(input.domain),
    }),
    defineTool({
      name: 'search',
      description: 'Find operations within a domain by name fragment.',
      inputSchema: searchInput,
      outputSchema: outputSchemaOf(searchResult),
      inputJsonSchema: inputJsonOf(searchInput),
      handle: (context, input) =>
        context.api.search(
          input.name === undefined ? { type: input.type } : { type: input.type, name: input.name },
        ),
    }),
    defineTool({
      name: 'inspect',
      description: 'Describe one operation in a domain, without running it.',
      inputSchema: inspectInput,
      outputSchema: outputSchemaOf(inspectResult),
      inputJsonSchema: inputJsonOf(inspectInput),
      handle: (context, input) => context.api.inspect(input),
    }),
    defineTool({
      name: 'act',
      description: 'Run one registered action. The id comes from discover or search.',
      inputSchema: actInput,
      // No outputSchema, and the reason is at the top of this function.
      inputJsonSchema: inputJsonOf(actInput),
      handle: async (context, input) => {
        if (!isRegisteredActionId(input.action)) {
          throw new UnknownActionError(input.action, (await context.api.discover()).domains ?? []);
        }
        return context.api.act(input.action, input.input ?? {});
      },
    }),
    defineTool({
      name: 'observe',
      description:
        'Subscribe to a domain. Returns a subscription id; events arrive out of ' +
        'band as notifications, not in this tool result.',
      inputSchema: observeInput,
      outputSchema: outputSchemaOf(observeResult),
      inputJsonSchema: inputJsonOf(observeInput),
      handle: (context, input) => ({ subscriptionId: context.subscribe(input.domain) }),
    }),
  ];

  const byName = new Map(definitions.map((tool) => [tool.name, tool]));

  // Not a runtime check for its own sake: a definition whose name is not a
  // primitive would be a tool the rest of the system cannot route to, and
  // failing here names the mismatch at the point it was written.
  for (const name of byName.keys()) {
    if (!(PRIMITIVES as readonly string[]).includes(name)) {
      throw new Error(`tool "${name}" is not one of the five primitives`);
    }
  }
  for (const primitive of PRIMITIVES) {
    if (!byName.has(primitive)) {
      throw new Error(`primitive "${primitive}" has no tool definition`);
    }
  }
  return byName;
}

/**
 * Infers each tool's input from its schema, then widens it to the common shape.
 *
 * The tools have five different input types, so the array has to be
 * heterogeneous; the double cast is what lets each entry keep its own inferred
 * parameter type while the collection stays one type. The alternative — a
 * 'never' element type — erased the handler parameters into implicit any and
 * took the type checking off exactly the code that parses caller input.
 */
function defineTool<I>(definition: ToolDefinition<I>): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

function inputJsonOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
}
