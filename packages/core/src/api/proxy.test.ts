import { describe, it, expect, vi, afterEach } from 'vitest';
import { addressFromStorageWord, addressFromCallResult, resolveProxyImplementation } from './proxy.js';

const ZERO_WORD = '0x' + '0'.repeat(64);
const RPC = 'https://rpc.example';

/** Right-align an address into a 32-byte word, as a storage slot holds it. */
const word = (address: string) => '0x' + address.replace(/^0x/, '').padStart(64, '0');

/**
 * Stub `fetch` with a handler that receives the decoded JSON-RPC request and
 * returns the `result` value (or null to fail the HTTP call).
 */
function stubRpc(handler: (method: string, params: unknown[]) => unknown) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const { method, params } = JSON.parse(init.body) as { method: string; params: unknown[] };
      calls.push({ method, params });
      const result = handler(method, params);
      if (result === null) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('addressFromStorageWord', () => {
  it('extracts the right-aligned 20-byte address from a 32-byte word', () => {
    // EIP-1967 implementation slot value for the Aave V3 Pool proxy.
    const w = '0x000000000000000000000000728a138a4823392c2efa55e028d434f526fe03cf';
    expect(addressFromStorageWord(w)).toBe('0x728a138a4823392c2efa55e028d434f526fe03cf');
  });

  it('returns null for an empty (zero) slot — i.e. not a proxy', () => {
    expect(addressFromStorageWord(ZERO_WORD)).toBeNull();
  });

  it('tolerates a short/unpadded word', () => {
    expect(addressFromStorageWord('0x0')).toBeNull();
  });
});

describe('addressFromCallResult', () => {
  it('extracts the address from a well-formed ABI-encoded address return', () => {
    expect(addressFromCallResult(word('0x23a685a5ece0e1cc5e1641d4da14b6b38c19733e'))).toBe(
      '0x23a685a5ece0e1cc5e1641d4da14b6b38c19733e'
    );
  });

  it('returns null for the zero address', () => {
    expect(addressFromCallResult(ZERO_WORD)).toBeNull();
  });

  it('returns null for empty return data (beacon has no code / reverted)', () => {
    expect(addressFromCallResult('0x')).toBeNull();
  });

  it('rejects a return that is not exactly 32 bytes rather than truncating it', () => {
    // 20 bytes: a naive right-slice would yield a plausible but wrong address.
    expect(addressFromCallResult('0x23a685a5ece0e1cc5e1641d4da14b6b38c19733e')).toBeNull();
    // 64 bytes.
    expect(addressFromCallResult(word('0x23a685a5ece0e1cc5e1641d4da14b6b38c19733e') + '0'.repeat(64))).toBeNull();
  });

  it('rejects non-zero left padding — malformed, so not a trustworthy address', () => {
    const dirty = '0x' + '1'.repeat(24) + '23a685a5ece0e1cc5e1641d4da14b6b38c19733e';
    expect(addressFromCallResult(dirty)).toBeNull();
  });

  it('rejects non-hex return data', () => {
    expect(addressFromCallResult('0x' + 'z'.repeat(64))).toBeNull();
  });
});

describe('resolveProxyImplementation', () => {
  const IMPL = '0x728a138a4823392c2efa55e028d434f526fe03cf';
  const BEACON = '0xfb435cca805f24f7a01fa8bf515165465b921d2b';
  const BEACON_IMPL = '0x23a685a5ece0e1cc5e1641d4da14b6b38c19733e';
  const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';

  it('resolves a direct EIP-1967 proxy and does not consult the beacon slot', async () => {
    const calls = stubRpc((method, params) =>
      method === 'eth_getStorageAt' && params[1] === IMPL_SLOT ? word(IMPL) : ZERO_WORD
    );

    expect(await resolveProxyImplementation(RPC, '0xproxy')).toEqual({ implementation: IMPL });
    // One call only: the beacon path must not run when the direct slot answers.
    expect(calls).toHaveLength(1);
  });

  it('resolves a beacon proxy via implementation() on the beacon', async () => {
    const calls = stubRpc((method, params) => {
      if (method === 'eth_getStorageAt' && params[1] === IMPL_SLOT) return ZERO_WORD;
      if (method === 'eth_getStorageAt' && params[1] === BEACON_SLOT) return word(BEACON);
      if (method === 'eth_call') return word(BEACON_IMPL);
      return null;
    });

    expect(await resolveProxyImplementation(RPC, '0xproxy')).toEqual({
      implementation: BEACON_IMPL,
      beacon: BEACON,
    });

    // The beacon is asked with the `implementation()` selector, and nothing else.
    const ethCall = calls.find((c) => c.method === 'eth_call');
    expect(ethCall?.params[0]).toEqual({ to: BEACON, data: '0x5c60da1b' });
  });

  it('returns null when neither slot is set — the target is not a proxy', async () => {
    stubRpc(() => ZERO_WORD);
    expect(await resolveProxyImplementation(RPC, '0xnotaproxy')).toBeNull();
  });

  it('returns null when the beacon reports the zero address', async () => {
    stubRpc((method, params) => {
      if (method === 'eth_getStorageAt' && params[1] === BEACON_SLOT) return word(BEACON);
      if (method === 'eth_call') return ZERO_WORD;
      return ZERO_WORD;
    });
    expect(await resolveProxyImplementation(RPC, '0xproxy')).toBeNull();
  });

  it('returns null when the beacon call reverts (empty return data)', async () => {
    stubRpc((method, params) => {
      if (method === 'eth_getStorageAt' && params[1] === BEACON_SLOT) return word(BEACON);
      if (method === 'eth_call') return '0x';
      return ZERO_WORD;
    });
    expect(await resolveProxyImplementation(RPC, '0xproxy')).toBeNull();
  });

  it('fails closed when the RPC is unavailable', async () => {
    stubRpc(() => null);
    expect(await resolveProxyImplementation(RPC, '0xproxy')).toBeNull();
  });

  it('fails closed, without throwing, when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    await expect(resolveProxyImplementation(RPC, '0xproxy')).resolves.toBeNull();
  });

  it('makes at most three RPC calls — resolution cannot loop', async () => {
    // A beacon that names itself would loop if the implementation were followed.
    const calls = stubRpc((method, params) => {
      if (method === 'eth_getStorageAt' && params[1] === IMPL_SLOT) return ZERO_WORD;
      if (method === 'eth_getStorageAt' && params[1] === BEACON_SLOT) return word(BEACON);
      if (method === 'eth_call') return word(BEACON);
      return null;
    });

    expect(await resolveProxyImplementation(RPC, '0xproxy')).toEqual({
      implementation: BEACON,
      beacon: BEACON,
    });
    expect(calls).toHaveLength(3);
  });
});
