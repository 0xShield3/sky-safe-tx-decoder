/**
 * Minimal JSON-RPC transport.
 *
 * Shared by every read this tool makes against a public node. It fails closed:
 * a network failure, a non-200, an abort, a JSON-RPC error object, or a
 * malformed response all yield null rather than throwing, because every caller
 * is an enhancement over data the tool already has and must degrade quietly.
 *
 * Nothing read through here is ever presented as verified on the strength of
 * the node's word alone. Callers either re-encode and byte-compare the result
 * (the Sourcify fallback) or show it to the signer as an input they can
 * override (the nested Safe prefills).
 */

/** Cap on a batch's size, so one hostile response cannot cause an unbounded request. */
const MAX_BATCH = 100;

/**
 * Make one JSON-RPC call.
 *
 * @returns the `result` string, or null on any failure.
 */
export async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { result?: unknown };
    return typeof json.result === 'string' ? json.result : null;
  } catch {
    // Network failure, abort, or malformed response. Fail closed.
    return null;
  }
}

/** One entry in a batched JSON-RPC request. */
export interface RpcBatchEntry {
  method: string;
  params: unknown[];
}

/**
 * Make many JSON-RPC calls in a single HTTP request.
 *
 * Batching keeps the request count at one regardless of how many entries are
 * passed, which matters on rate-limited public endpoints. Nodes that reject a
 * batch are handled by falling back to parallel single calls, so the caller
 * gets the same answer either way.
 *
 * @returns one entry per input, in input order. A failed entry is null.
 */
export async function rpcBatch(
  rpcUrl: string,
  entries: RpcBatchEntry[],
  signal?: AbortSignal
): Promise<Array<string | null>> {
  if (entries.length === 0) return [];
  if (entries.length > MAX_BATCH) entries = entries.slice(0, MAX_BATCH);

  const parallel = () =>
    Promise.all(entries.map((entry) => rpcCall(rpcUrl, entry.method, entry.params, signal)));

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        entries.map((entry, index) => ({
          jsonrpc: '2.0',
          id: index,
          method: entry.method,
          params: entry.params,
        }))
      ),
      signal,
    });
    if (!response.ok) return parallel();

    const json = (await response.json()) as unknown;
    // A node that does not support batching answers with a single object.
    if (!Array.isArray(json)) return parallel();

    // Responses may arrive in any order, so index by the id we assigned.
    const byId = new Map<number, string | null>();
    for (const item of json as Array<{ id?: unknown; result?: unknown }>) {
      if (typeof item?.id !== 'number') continue;
      byId.set(item.id, typeof item.result === 'string' ? item.result : null);
    }
    return entries.map((_, index) => byId.get(index) ?? null);
  } catch {
    // An abort must not be retried as parallel calls.
    if (signal?.aborted) return entries.map(() => null);
    return parallel();
  }
}
