/**
 * The Codex adapter's half of `POST /api/events` — which now lives in protocol.
 *
 * This file used to hold the client. It was moved to
 * `packages/protocol/src/ingest.ts` when the second log-watching adapter landed,
 * because an adapter may not import another adapter, so "share it" could only
 * have meant one copy per harness, and a third copy of a transport is the drift
 * that lifting `EventBuffer` here was done to prevent. The original file's own
 * comment named that condition — "the honest fix is one client in protocol once
 * the second adapter needs it" — and this is the second adapter.
 *
 * These re-exports keep the adapter's public surface byte-for-byte the same, so
 * the cursor and gemini adapters importing `@battle-agents/protocol` and this
 * one importing the same names are the same code reaching the same function.
 */

export { createIngestSender, IngestRefusedError } from '@battle-agents/protocol';
export type {
  FetchLike,
  HttpRequestInit,
  HttpResponseLike,
  IngestOptions,
} from '@battle-agents/protocol';
