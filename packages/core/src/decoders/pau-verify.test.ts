/**
 * Tests for the live PAU dispatch check.
 *
 * The mismatch cases are built by making `getDispatches` answer with a
 * different facet or delegate selector — the only thing that can actually go
 * wrong here. Flipping bytes inside the arguments would not test this at all:
 * the Controller forwards argument bytes verbatim, so altered arguments produce
 * a canonical call that still round-trips and still resolves to the same
 * function. The failure this module exists to catch is a REWIRED SELECTOR, and
 * only the dispatch answer expresses that.
 *
 * `fetch` is stubbed. No test here touches a network.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Address, Hex } from 'viem';
import { encodeAbiParameters, encodeFunctionData, parseAbi } from 'viem';
import { decodeMultiSend } from '../security/multisend-decoder.js';
import { pauVerificationTargets, verifyPauDispatches } from './pau-verify.js';
import { findPauControllerTable, findPauWire } from './pau-common.js';
import { PAU_DISPATCH_TABLES } from './pau-dispatch-table.js';

const GROVE_AGENT = '0xdBD17832df0e57b1732cE1C84c652E820e549BAa';
const GROVE_CONTROLLER = '0xbf83F5974B932c7D842254042717D6A2706CE5eE';
const UNISWAP_V3_FACET = '0x445D9Dc752F269Be48250f1A180CAC4c61cE4bab';
const RPC_URL = 'https://rpc.invalid/never-called';

const groveTable = findPauControllerTable(PAU_DISPATCH_TABLES, GROVE_CONTROLLER)!;

const DISPATCHES_OUTPUT = [
  {
    type: 'tuple[]',
    components: [
      { name: 'facet', type: 'address' },
      { name: 'delegateSelector', type: 'bytes4' },
    ],
  },
] as const;

/** Answer `getDispatches` with an arbitrary list, as the Controller would. */
function stubDispatches(dispatches: Array<{ facet: Address; delegateSelector: Hex }>) {
  const encoded = encodeAbiParameters(DISPATCHES_OUTPUT, [dispatches]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: encoded }),
    }))
  );
}

/** What the chain would answer if the frozen table were correct. */
function frozenAnswer(selectors: Hex[]) {
  return selectors.map(selector => {
    const wire = findPauWire(groveTable, selector)!;
    return { facet: wire.facet, delegateSelector: wire.delegateSelector };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const FIXTURE_DIR = fileURLToPath(new URL('../../../ui/src/dev/fixtures/', import.meta.url));

function agentCallFromFixture(name: string): Hex {
  const fixture = JSON.parse(readFileSync(`${FIXTURE_DIR}${name}.json`, 'utf8'));
  const inner = decodeMultiSend(fixture.transaction.data as Hex)!;
  return inner.find(item => item.to.toLowerCase() === GROVE_AGENT.toLowerCase())!.data;
}

const BATCH_CALL_ABI = parseAbi([
  'function batchCall(address[] targets, bytes[] data, uint256[] values)',
]);

function batchCall(calls: Array<{ target: Address; data: Hex }>): Hex {
  return encodeFunctionData({
    abi: BATCH_CALL_ABI,
    functionName: 'batchCall',
    args: [calls.map(c => c.target), calls.map(c => c.data), calls.map(() => 0n)],
  });
}

describe('pauVerificationTargets', () => {
  it('finds the Controller and its selectors in a real batch', () => {
    const targets = pauVerificationTargets(
      GROVE_AGENT,
      agentCallFromFixture('pau-basin-withdraw-psm-burn')
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]!.controller).toBe(GROVE_CONTROLLER);
    expect(targets[0]!.callSelectors).toEqual(['0xa51e3864', '0x8c88adef', '0x48d63a13']);
  });

  it('deduplicates a selector used twice in one batch', () => {
    const mint = '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a' as Hex;
    const targets = pauVerificationTargets(
      GROVE_AGENT,
      batchCall([
        { target: GROVE_CONTROLLER, data: mint },
        { target: GROVE_CONTROLLER, data: mint },
      ])
    );
    expect(targets[0]!.callSelectors).toEqual(['0xa5b7e02d']);
  });

  it('ignores an address that is not a known AdministeredAgent', () => {
    expect(
      pauVerificationTargets(
        '0x1111111111111111111111111111111111111111',
        agentCallFromFixture('pau-uniswap-v3-swap')
      )
    ).toEqual([]);
  });

  it('ignores a call that is not batchCall', () => {
    expect(pauVerificationTargets(GROVE_AGENT, '0xdeadbeef' as Hex)).toEqual([]);
  });

  it('leaves out a Controller with no frozen table, which the decoder already refuses', () => {
    expect(
      pauVerificationTargets(
        GROVE_AGENT,
        batchCall([
          {
            target: '0x0DD65461610Fe5b65cE50A870B10ED0F3d24d8C2',
            data: '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a',
          },
        ])
      )
    ).toEqual([]);
  });
});

describe('verifyPauDispatches — agreement', () => {
  it('reports verified when the Controller matches the frozen table', async () => {
    const selectors: Hex[] = ['0xa5b7e02d', '0xe4696d83'];
    stubDispatches(frozenAnswer(selectors));

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: selectors },
    });

    expect(result.status).toBe('verified');
    expect(result.mismatches).toEqual([]);
    expect(result.callSelectors).toEqual(selectors);
    expect(result.frozenAtBlock).toBe(groveTable.frozenAtBlock);
    expect(result.frozenAtDate).toBe(groveTable.frozenAtDate);
  });

  it('makes exactly one eth_call for the whole batch', async () => {
    const selectors: Hex[] = ['0xa5b7e02d', '0xe4696d83', '0x48d63a13'];
    stubDispatches(frozenAnswer(selectors));

    await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: selectors },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.method).toBe('eth_call');
    expect(body.params[0].to).toBe(GROVE_CONTROLLER);
  });
});

describe('verifyPauDispatches — a rewired selector', () => {
  const selectors: Hex[] = ['0x140aad6a'];

  it('refuses when the facet changed', async () => {
    stubDispatches([
      { facet: '0x1111111111111111111111111111111111111111', delegateSelector: '0x73d76dbe' },
    ]);

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: selectors },
    });

    expect(result.status).toBe('mismatch');
    expect(result.mismatches).toHaveLength(1);
    const [mismatch] = result.mismatches;
    expect(mismatch!.kind).toBe('facet');
    expect(mismatch!.callSelector).toBe('0x140aad6a');
    expect(mismatch!.frozenFacet).toBe(UNISWAP_V3_FACET);
    expect(mismatch!.onChainFacet?.toLowerCase()).toBe('0x1111111111111111111111111111111111111111');
    expect(mismatch!.frozenSignature).toBe('setMaxSlippage(address,uint256)');
  });

  it('refuses when the delegate selector changed under the same facet', async () => {
    // The dangerous case: the facet is unchanged and the arguments still
    // round-trip, so nothing but this check notices that a different function
    // executes.
    stubDispatches([{ facet: UNISWAP_V3_FACET, delegateSelector: '0x690b2c22' }]);

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: selectors },
    });

    expect(result.status).toBe('mismatch');
    expect(result.mismatches[0]!.kind).toBe('delegate-selector');
    expect(result.mismatches[0]!.frozenDelegateSelector).toBe('0x73d76dbe');
    expect(result.mismatches[0]!.onChainDelegateSelector).toBe('0x690b2c22');
  });

  it('refuses when the selector is no longer wired at all', async () => {
    stubDispatches([
      { facet: '0x0000000000000000000000000000000000000000', delegateSelector: '0x00000000' },
    ]);

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: selectors },
    });

    expect(result.status).toBe('mismatch');
    expect(result.mismatches[0]!.kind).toBe('not-wired');
    expect(result.mismatches[0]!.onChainFacet).toBeNull();
  });

  it('reports only the selectors that changed', async () => {
    const many: Hex[] = ['0xa5b7e02d', '0x140aad6a'];
    const answer = frozenAnswer(many);
    answer[1] = { facet: UNISWAP_V3_FACET, delegateSelector: '0xdeadbeef' };
    stubDispatches(answer);

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: many },
    });

    expect(result.status).toBe('mismatch');
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]!.callSelector).toBe('0x140aad6a');
  });
});

describe('verifyPauDispatches — no verdict available', () => {
  it('reports unavailable when the RPC does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: ['0xa5b7e02d'] },
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('did not answer');
    // The frozen-at block is still reported, because that is what the caller
    // has to state as a caveat.
    expect(result.frozenAtBlock).toBe(groveTable.frozenAtBlock);
  });

  it('reports unavailable when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: ['0xa5b7e02d'] },
    });

    expect(result.status).toBe('unavailable');
  });

  it('reports unavailable when the answer has the wrong number of entries', async () => {
    stubDispatches(frozenAnswer(['0xa5b7e02d']));

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: ['0xa5b7e02d', '0xe4696d83'] },
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('returned 1 entries for 2 selectors');
  });

  it('reports unavailable for a Controller with no frozen table', async () => {
    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: {
        controller: '0x0DD65461610Fe5b65cE50A870B10ED0F3d24d8C2',
        callSelectors: ['0xa5b7e02d'],
      },
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('no frozen dispatch table');
  });

  it('does not call the RPC when no selector is in the frozen table', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await verifyPauDispatches({
      rpcUrl: RPC_URL,
      target: { controller: GROVE_CONTROLLER, callSelectors: ['0xdeadbeef'] },
    });

    expect(result.status).toBe('unavailable');
    expect(result.unknownSelectors).toEqual(['0xdeadbeef']);
    expect(fetch).not.toHaveBeenCalled();
  });
});
