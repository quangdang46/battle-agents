import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AUTHENTICATION_REASONS, isAuthenticationFailure } from './api.js';

/**
 * The `ApplicationApi` interface is a contract, and a contract is checked
 * against what it actually says rather than against what a reader assumes it
 * says.
 *
 * ## Why this reads the source instead of the types
 *
 * Both failures this covers are invisible to the compiler. A duplicate
 * overload is legal TypeScript and resolves to the same signature, so nothing
 * fails to build and nothing warns; and a doc comment claiming an invariant the
 * signatures do not keep is prose, which no type system has an opinion about.
 * The only mechanical check either can have is to read the declaration.
 *
 * That is not a preference for source inspection. It is the same reason
 * `scripts/check-schema-hygiene.sh` reads the committed migrations instead of
 * importing the schema: the thing that has to be proven is what will be built,
 * and a test that imports the module is reading a resolved, aliased, possibly
 * different artefact.
 *
 * ## Why a blanket claim is treated as a claim
 *
 * The check below is not "this comment must not exist". It is: if a comment in
 * this interface says every method is async, then every method must return a
 * Promise. A comment that stops being true is a comment that will be trusted
 * by the next reader, and the one that was wrong here said "Every method is
 * async" directly above an `observe` that returns an `Observer` — which is
 * correct, because a subscription has nothing to await.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('./api.ts', import.meta.url)), 'utf8');

/** The interface's body, comments and all, by brace matching rather than regex. */
function interfaceBody(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name} {`);
  if (start === -1) throw new Error(`${name} is not declared in api.ts`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return source.slice(source.indexOf('{', start) + 1, index);
  }
  throw new Error(`${name} has no closing brace`);
}

const BODY = interfaceBody(SOURCE, 'ApplicationApi');

/** The body with every block and line comment removed, so only code is left. */
const CODE_ONLY = BODY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

interface Declaration {
  readonly name: string;
  readonly returnsPromise: boolean;
}

/**
 * One entry per method declaration, in source order.
 *
 * Duplicates are deliberately NOT collapsed: a member declared twice is two
 * entries, which is what makes the duplicate `act` below fail rather than pass
 * quietly. An interface that declared the same method five times would still
 * typecheck and still behave identically, which is exactly why nothing else in
 * the build can be relied on to notice.
 *
 * The parameter list is matched by balancing parentheses rather than by
 * `[^(]*`, because `observe` takes a callback — `listener: (event: unknown) =>
 * void` — and a character class stops at the first `(` it meets. A parser that
 * silently skips the one method it cannot read is the same defect as a check
 * that reads a file it never loaded.
 */
function declarations(body: string): readonly Declaration[] {
  const found: Declaration[] = [];
  const member = /^\s{2}(\w+)(?:<[^<>()]*>)?\(/gm;
  for (const match of body.matchAll(member)) {
    const parametersStart = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let end = parametersStart;
    for (; end < body.length; end += 1) {
      if (body[end] === '(') depth += 1;
      if (body[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const returnType = body.slice(end + 1, body.indexOf(';', end)).trim();
    found.push({ name: match[1] ?? '', returnsPromise: returnType.startsWith('Promise<') });
  }
  return found;
}

const DECLARED = declarations(CODE_ONLY);

function names(): readonly string[] {
  return DECLARED.map((declaration) => declaration.name);
}

describe('the frozen ApplicationApi surface', () => {
  it('declares the five primitives, and nothing else', () => {
    expect(names()).toEqual(['discover', 'search', 'inspect', 'act', 'observe']);
  });

  it('recognises every reason it declares, and nothing else', () => {
    // `isAuthenticationFailure` was `typeof reason === 'string'`, which accepted
    // any string at all; it is now a closed set. A closed set is only an
    // improvement if the guard and the set agree, and the version of this that
    // shipped briefly had a seven-value union behind a guard that still tested
    // three — the type said seven and the runtime said three, and every
    // "refuses a request that presents no credential" route answered 500 to a
    // caller who had sent no credential.
    //
    // What this does NOT check, and what caused that failure, is whether the set
    // is wide enough for the system it serves. The four reasons that fell
    // through were all real and all in production use. A test written from the
    // same list cannot notice a list that is too small; that comparison has to
    // read the list the credential layer actually raises, which this package may
    // not import.
    for (const reason of AUTHENTICATION_REASONS) {
      expect(isAuthenticationFailure(Object.assign(new Error('x'), { reason }))).toBe(true);
    }
    expect(isAuthenticationFailure(Object.assign(new Error('x'), { reason: 'typo' }))).toBe(false);
    expect(isAuthenticationFailure(Object.assign(new Error('x'), { reason: 7 }))).toBe(false);
    expect(isAuthenticationFailure(new Error('x'))).toBe(false);
    expect(isAuthenticationFailure({ reason: 'expired' })).toBe(false);
  });

  it('declares act exactly once', () => {
    // The duplicate this guards was a byte-identical second overload carrying a
    // second, overlapping explanation. TypeScript accepts it, resolves every
    // call to whichever it likes, and reports nothing — so a reader comparing
    // the two comments could believe two different rules were in force when
    // one of them was simply never read.
    const actDeclarations = DECLARED.filter((declaration) => declaration.name === 'act');
    expect(actDeclarations).toHaveLength(1);
  });

  it('declares observe exactly once, and synchronously', () => {
    // `observe` registers a listener and returns the handle that stops it, so
    // there is nothing to await. The interface is the only place that says so;
    // every surface that consumes it is written against whatever this declares.
    const observe = DECLARED.filter((declaration) => declaration.name === 'observe');
    expect(observe).toHaveLength(1);
    expect(observe[0]?.returnsPromise).toBe(false);
  });
});

describe('a comment in this interface must be true of the interface', () => {
  it('makes no blanket async claim while a method is synchronous', () => {
    // A blanket claim is matched rather than this specific sentence being
    // banned, so rewording the comment does not quietly restore the defect and
    // a differently-worded claim gets the same scrutiny.
    const blanketAsyncClaims = [...BODY.matchAll(/\/\*([\s\S]*?)\*\//g)]
      .map((match) => match[1] ?? '')
      .filter((comment) => /\b(?:every|all) methods?\b/i.test(comment) && /async/i.test(comment));

    const synchronous = DECLARED.filter((declaration) => !declaration.returnsPromise).map(
      (declaration) => declaration.name,
    );

    // A comment claiming every method is async is only true when there is no
    // method that is not. The empty assertion is the point: when both hold,
    // `synchronous` is non-empty and this fails naming the methods that
    // contradict it.
    expect(blanketAsyncClaims.length > 0 ? synchronous : []).toEqual([]);
  });
});
