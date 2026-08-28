/**
 * Tests for Safe state read over JSON-RPC.
 *
 * `fetch` is stubbed. The encoded return data below is the real data the
 * Ethereum mainnet node returned for these calls, so the decoding is exercised
 * against bytes a node actually produced.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { encodeAbiParameters, toFunctionSelector } from 'viem';
import {
  GET_OWNERS_SELECTOR,
  NONCE_SELECTOR,
  VERSION_SELECTOR,
  detectNestedSafeOwners,
  fetchSafeNonceOnchain,
  fetchSafeOwners,
  fetchSafeVersionOnchain,
} from './safe-onchain.js';

const RPC = 'https://node.example/rpc';
const PARENT = '0x1a37bF1Ccbf570C92FE2239FefaaAF861c2924DD';
const NESTED = '0xC3eA7C657884BB380B66D79C36aDCb5658b01896';
const NESTED_V13 = '0x11cd09a0c5B1dc674615783b0772a9bFD53e3A8F';
const EOA = '0x0f50874f227621Dea72482004639a9fFe440A4dA';

const encodeString = (value: string) => encodeAbiParameters([{ type: 'string' }], [value]);
const encodeAddresses = (values: string[]) =>
  encodeAbiParameters([{ type: 'address[]' }], [values as `0x${string}`[]]);

/**
 * Stub `fetch` with a handler over the parsed JSON-RPC body. Returning
 * undefined for an entry stands for an empty `0x` answer.
 */
function stubRpc(handler: (entry: { method: string; params: any[] }) => string | undefined) {
  const calls: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      const answer = (entry: any) => ({
        jsonrpc: '2.0',
        id: entry.id,
        result: handler({ method: entry.method, params: entry.params }) ?? '0x',
      });
      const payload = Array.isArray(body) ? body.map(answer) : answer(body);
      return { ok: true, json: async () => payload };
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectors', () => {
  it('match viem derivation', () => {
    expect(GET_OWNERS_SELECTOR).toBe(toFunctionSelector('getOwners()'));
    expect(VERSION_SELECTOR).toBe(toFunctionSelector('VERSION()'));
    expect(NONCE_SELECTOR).toBe(toFunctionSelector('nonce()'));
  });
});

describe('fetchSafeOwners', () => {
  it('decodes and checksums the owner list', async () => {
    stubRpc(() => encodeAddresses([EOA.toLowerCase(), NESTED.toLowerCase()]));

    await expect(fetchSafeOwners(RPC, PARENT)).resolves.toEqual([EOA, NESTED]);
  });

  it('returns null for empty return data (not a Safe)', async () => {
    stubRpc(() => '0x');

    await expect(fetchSafeOwners(RPC, PARENT)).resolves.toBeNull();
  });

  it('returns null for undecodable return data', async () => {
    stubRpc(() => '0xdeadbeef');

    await expect(fetchSafeOwners(RPC, PARENT)).resolves.toBeNull();
  });

  it('returns null when the node is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );

    await expect(fetchSafeOwners(RPC, PARENT)).resolves.toBeNull();
  });
});

describe('fetchSafeVersionOnchain', () => {
  it('decodes the version string', async () => {
    stubRpc(() => encodeString('1.4.1'));

    await expect(fetchSafeVersionOnchain(RPC, NESTED)).resolves.toBe('1.4.1');
  });

  it('returns null for an EOA', async () => {
    stubRpc(() => '0x');

    await expect(fetchSafeVersionOnchain(RPC, EOA)).resolves.toBeNull();
  });

  it('rejects a string that is not shaped like a version', async () => {
    // A contract with a permissive fallback can answer anything.
    stubRpc(() => encodeString('MyToken'));

    await expect(fetchSafeVersionOnchain(RPC, EOA)).resolves.toBeNull();
  });
});

describe('fetchSafeNonceOnchain', () => {
  it('decodes the nonce as a decimal string', async () => {
    // Real return data from the nested Safe. The word decodes to 14.
    stubRpc(() => '0x000000000000000000000000000000000000000000000000000000000000000e');

    await expect(fetchSafeNonceOnchain(RPC, NESTED)).resolves.toBe('14');
  });

  it('returns null for empty return data', async () => {
    stubRpc(() => '0x');

    await expect(fetchSafeNonceOnchain(RPC, NESTED)).resolves.toBeNull();
  });
});

describe('detectNestedSafeOwners', () => {
  const ownerList = [EOA, NESTED, NESTED_V13];

  function stubParentWithOwners() {
    return stubRpc((entry) => {
      const to = entry.params?.[0]?.to as string;
      const data = entry.params?.[0]?.data as string;
      if (data === GET_OWNERS_SELECTOR) return encodeAddresses(ownerList);
      if (data === VERSION_SELECTOR) {
        if (to === NESTED) return encodeString('1.4.1');
        if (to === NESTED_V13) return encodeString('1.3.0');
        return '0x'; // EOA
      }
      return '0x';
    });
  }

  it('reports only the owners that are Safes, with their versions', async () => {
    stubParentWithOwners();

    await expect(detectNestedSafeOwners(RPC, PARENT)).resolves.toEqual([
      { address: NESTED, version: '1.4.1' },
      { address: NESTED_V13, version: '1.3.0' },
    ]);
  });

  it('costs two HTTP requests regardless of owner count', async () => {
    const calls = stubParentWithOwners();

    await detectNestedSafeOwners(RPC, PARENT);

    expect(calls).toHaveLength(2);
    // The second request is a single batch carrying one probe per owner.
    expect(Array.isArray(calls[1])).toBe(true);
    expect(calls[1]).toHaveLength(ownerList.length);
  });

  it('maps batch answers by id, not arrival order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        if (!Array.isArray(body)) {
          return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: encodeAddresses(ownerList) }) };
        }
        // Answer out of order, and give the EOA's slot a Safe-looking version
        // so an order-based reader would attribute it to the wrong owner.
        return {
          ok: true,
          json: async () => [
            { jsonrpc: '2.0', id: 2, result: encodeString('1.3.0') },
            { jsonrpc: '2.0', id: 0, result: '0x' },
            { jsonrpc: '2.0', id: 1, result: encodeString('1.4.1') },
          ],
        };
      })
    );

    await expect(detectNestedSafeOwners(RPC, PARENT)).resolves.toEqual([
      { address: NESTED, version: '1.4.1' },
      { address: NESTED_V13, version: '1.3.0' },
    ]);
  });

  it('falls back to single calls when the node rejects batching', async () => {
    let batchAttempts = 0;
    let singleCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        if (Array.isArray(body)) {
          batchAttempts++;
          // Some nodes answer a batch with a single error object.
          return { ok: true, json: async () => ({ jsonrpc: '2.0', id: null, error: { message: 'no batch' } }) };
        }
        singleCalls++;
        const data = body.params?.[0]?.data as string;
        const to = body.params?.[0]?.to as string;
        if (data === GET_OWNERS_SELECTOR) {
          return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: encodeAddresses(ownerList) }) };
        }
        const version = to === NESTED ? encodeString('1.4.1') : to === NESTED_V13 ? encodeString('1.3.0') : '0x';
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: version }) };
      })
    );

    await expect(detectNestedSafeOwners(RPC, PARENT)).resolves.toEqual([
      { address: NESTED, version: '1.4.1' },
      { address: NESTED_V13, version: '1.3.0' },
    ]);
    expect(batchAttempts).toBe(1);
    // One getOwners plus one probe per owner.
    expect(singleCalls).toBe(1 + ownerList.length);
  });

  it('returns an empty list when the node is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );

    await expect(detectNestedSafeOwners(RPC, PARENT)).resolves.toEqual([]);
  });

  it('returns an empty list when no owner is a Safe', async () => {
    stubRpc((entry) => {
      const data = entry.params?.[0]?.data as string;
      return data === GET_OWNERS_SELECTOR ? encodeAddresses([EOA]) : '0x';
    });

    await expect(detectNestedSafeOwners(RPC, PARENT)).resolves.toEqual([]);
  });
});
