/**
 * Tests for the PAU AdministeredAgent decoder.
 *
 * The five fixture cases are the real MultiSend payloads of five executed
 * mainnet transactions from Grove's allocator Safe
 * 0x9187807e07112359C481870feB58f0c117a29179, nonces 8 to 12. They are read
 * from the UI's dev fixtures rather than copied here, so the test decodes the
 * exact bytes the dev mock serves: a fixture that stops decoding fails this
 * suite instead of only looking wrong in a browser.
 *
 * They also exercise the full nesting the decoder exists for —
 * MultiSend -> AdministeredAgent.batchCall -> Controller -> facet — which a
 * copied inner payload would not.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Address, Hex } from 'viem';
import { encodeAbiParameters, encodeFunctionData, parseAbi } from 'viem';
import { decodeMultiSend } from '../security/multisend-decoder.js';
import { PAUAdministeredAgentDecoder, createPauAgentDecoders } from './pau-agent.js';
import { isPauFrozenTableCaveat } from './pau-common.js';

const GROVE_AGENT = '0xdBD17832df0e57b1732cE1C84c652E820e549BAa';
const GROVE_CONTROLLER = '0xbf83F5974B932c7D842254042717D6A2706CE5eE';
const UNISWAP_V3_FACET = '0x445D9Dc752F269Be48250f1A180CAC4c61cE4bab';
const AUSD_USDC_POOL = '0xbAFeAd7c60Ea473758ED6c6021505E8BBd7e8E5d';

const ALL_FIXTURES = [
  'pau-usds-mint-basin-deposit',
  'pau-basin-withdraw-psm-burn',
  'pau-uniswap-v3-swap',
  'pau-uniswap-v3-add-liquidity',
  'pau-uniswap-v3-remove-liquidity',
];

const decoder = new PAUAdministeredAgentDecoder({
  address: GROVE_AGENT,
  label: 'Grove PAU AdministeredAgent',
  network: 'ethereum',
});

const BATCH_CALL_ABI = parseAbi([
  'function batchCall(address[] targets, bytes[] data, uint256[] values)',
]);

/** Build a batchCall payload from raw Controller calldata. */
function batchCall(calls: Array<{ target: Address; data: Hex; value?: bigint }>): Hex {
  return encodeFunctionData({
    abi: BATCH_CALL_ABI,
    functionName: 'batchCall',
    args: [
      calls.map(call => call.target),
      calls.map(call => call.data),
      calls.map(call => call.value ?? 0n),
    ],
  });
}

const FIXTURE_DIR = fileURLToPath(new URL('../../../ui/src/dev/fixtures/', import.meta.url));

/** The AdministeredAgent call inside a fixture's MultiSend payload. */
function agentCallFromFixture(name: string): Hex {
  const fixture = JSON.parse(readFileSync(`${FIXTURE_DIR}${name}.json`, 'utf8'));
  const inner = decodeMultiSend(fixture.transaction.data as Hex);
  if (!inner) throw new Error(`${name}: not a MultiSend payload`);
  const agentCall = inner.find(item => item.to.toLowerCase() === GROVE_AGENT.toLowerCase());
  if (!agentCall) throw new Error(`${name}: no call to ${GROVE_AGENT}`);
  return agentCall.data;
}

describe('PAUAdministeredAgentDecoder.canDecode', () => {
  it('claims a batchCall to its own agent', () => {
    expect(decoder.canDecode(GROVE_AGENT, '0x4e120423' as Hex)).toBe(true);
  });

  it('ignores another address', () => {
    expect(decoder.canDecode('0x1111111111111111111111111111111111111111', '0x4e120423' as Hex)).toBe(
      false
    );
  });

  it('ignores call(address,bytes), which the Sourcify fallback covers', () => {
    // AdministeredAgent.call is verified on Sourcify. Claiming it here would
    // replace a working decoding with one this build has never seen exercised.
    expect(decoder.canDecode(GROVE_AGENT, '0x6dbf2fa0' as Hex)).toBe(false);
  });

  it('builds one decoder per known AdministeredAgent', () => {
    const decoders = createPauAgentDecoders();
    expect(decoders.length).toBeGreaterThanOrEqual(2);
    expect(decoders.map(d => d.contractAddress)).toContain(GROVE_AGENT);
  });
});

describe('the five real Grove transactions', () => {
  it('decodes nonce 8 — mint USDS, then deposit it into the JTRSY Basin', () => {
    const decoded = decoder.decode(agentCallFromFixture('pau-usds-mint-basin-deposit'));

    expect(decoded.isMulticall).toBe(true);
    expect(decoded.main.name).toBe('batchCall');
    expect(decoded.generalWarnings).toBeUndefined();
    expect(decoded.nested).toHaveLength(2);

    const [mint, deposit] = decoded.nested!;
    expect(mint!.name).toBe('mint');
    expect(mint!.signature).toBe('mint(uint256)');
    expect(mint!.explanation).toContain('0xa5b7e02d');
    expect(mint!.explanation).toContain('0xa0712d68');
    expect(paramValue(mint!, 'usdsAmount')).toContain('111,072.717425 USDS');

    expect(deposit!.name).toBe('deposit');
    expect(deposit!.signature).toBe('deposit(address,address,uint256,uint256)');
    expect(paramValue(deposit!, 'basin')).toBe('0xf08943f817e1F902dEbC884c7B19Ea5764594Ac9');
    expect(paramValue(deposit!, 'asset')).toBe('0xdC035D45d973E3EC169d2276DDab16f1e407384F');
    expect(paramValue(deposit!, 'amount')).toContain('111,072.717425 USDS');
  });

  it('decodes nonce 9 — Basin withdraw, PSM swap, USDS burn', () => {
    const decoded = decoder.decode(agentCallFromFixture('pau-basin-withdraw-psm-burn'));

    expect(decoded.nested).toHaveLength(3);
    expect(decoded.nested!.map(call => call.name)).toEqual(['withdraw', 'swapUSDCToUSDS', 'burn']);
    expect(decoded.nested![0]!.signature).toBe('withdraw(address,address,uint256,uint256)');
    expect(paramValue(decoded.nested![0]!, 'maxAmount')).toContain('10,000,000 USDC');
    expect(paramValue(decoded.nested![1]!, 'usdcAmount')).toContain('111,084.66881 USDC');
    expect(paramValue(decoded.nested![2]!, 'usdsAmount')).toContain('111,084.66881 USDS');
  });

  it('decodes nonce 10 — a Uniswap v3 swap', () => {
    const decoded = decoder.decode(agentCallFromFixture('pau-uniswap-v3-swap'));

    expect(decoded.nested).toHaveLength(1);
    const swap = decoded.nested![0]!;
    expect(swap.signature).toBe('swap(address,address,uint256,uint256,uint24)');
    expect(paramValue(swap, 'pool')).toBe(AUSD_USDC_POOL);
    expect(paramValue(swap, 'tokenIn')).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    expect(paramValue(swap, 'amountIn')).toBe('750000000000');
    expect(paramValue(swap, 'tickDelta')).toBe('10');
    // maxSlippage does not bound a swap, and the decoder says so.
    expect(swap.explanation).toContain('not by maxSlippage');
  });

  it('decodes nonce 11 — addLiquidity, with its tick and amount tuples', () => {
    const decoded = decoder.decode(agentCallFromFixture('pau-uniswap-v3-add-liquidity'));

    const add = decoded.nested![0]!;
    expect(add.name).toBe('addLiquidity');
    expect(add.signature).toBe(
      'addLiquidity(address,uint256,(int24,int24),(uint256,uint256),(uint256,uint256),uint256)'
    );
    expect(paramValue(add, 'ticks')).toBe('{lower: -10, upper: 10}');
    expect(paramValue(add, 'target')).toBe('{amount0: 48900000000, amount1: 51100000000}');
    expect(paramValue(add, 'min')).toBe('{amount0: 48875549999, amount1: 48875549999}');
    expect(paramValue(add, 'deadline')).toBe('1787187563');
  });

  it('decodes nonce 12 — removeLiquidity', () => {
    const decoded = decoder.decode(agentCallFromFixture('pau-uniswap-v3-remove-liquidity'));

    const remove = decoded.nested![0]!;
    expect(remove.name).toBe('removeLiquidity');
    expect(remove.signature).toBe('removeLiquidity(address,uint256,uint128,(uint256,uint256),uint256)');
    expect(paramValue(remove, 'tokenId')).toBe('1352494');
    expect(paramValue(remove, 'liquidity')).toBe('1000223324856');
  });

  it('names the Controller, facet, integration and both selectors on every call', () => {
    for (const name of ALL_FIXTURES) {
      const decoded = decoder.decode(agentCallFromFixture(name));
      for (const call of decoded.nested!) {
        expect(call.explanation).toContain(`Controller — ${GROVE_CONTROLLER}`);
        expect(call.explanation).toMatch(/Facet — 0x[0-9a-fA-F]{40} \(\w+\)/);
        expect(call.explanation).toMatch(/Call selector \(sent\) — 0x[0-9a-f]{8}/);
        expect(call.explanation).toMatch(/Delegate selector \(executed\) — 0x[0-9a-f]{8}/);
        expect(call.explanation).toMatch(/Integration id — 0x[0-9a-f]{64}/);
        expect(call.explanation).toContain('ETH value — 0 wei');
      }
    }
  });

  it('carries each call\'s target and complete calldata on the call itself', () => {
    for (const name of ALL_FIXTURES) {
      const agentCall = agentCallFromFixture(name);
      const decoded = decoder.decode(agentCall);
      for (const call of decoded.nested!) {
        expect(call.target).toBe(GROVE_CONTROLLER);
        expect(call.rawCalldata).toMatch(/^0x[0-9a-f]+$/);
        // The complete bytes, not a prefix: the batch calldata contains them.
        expect(agentCall).toContain(call.rawCalldata!.slice(2));
      }
    }
  });

  it('states the frozen block once for the batch, never on a call', () => {
    const decoded = decoder.decode(agentCallFromFixture('pau-basin-withdraw-psm-burn'));

    const caveats = decoded.main.warnings!.filter(isPauFrozenTableCaveat);
    expect(caveats).toHaveLength(1);
    expect(caveats[0]).toMatch(/frozen at block \d+ \(\d{4}-\d{2}-\d{2}\)/);

    // Three calls, one caveat. Repeating it under each buried the arguments,
    // and the web UI drops it in favour of its own live-check banner.
    expect(decoded.nested).toHaveLength(3);
    for (const call of decoded.nested!) {
      expect(call.explanation).not.toContain('frozen at block');
      expect(call.warnings ?? []).not.toContain(expect.stringContaining('frozen at block'));
    }
  });

  it('does not repeat the selector-swap mechanics under every call', () => {
    // The two selector bullets directly above said it already.
    const decoded = decoder.decode(agentCallFromFixture('pau-basin-withdraw-psm-burn'));
    for (const call of decoded.nested!) {
      expect(call.explanation).not.toContain('does not execute');
      expect(call.explanation).not.toContain('delegatecalls');
    }
  });

  it('never elides an identifier', () => {
    for (const name of [
      'pau-usds-mint-basin-deposit',
      'pau-basin-withdraw-psm-burn',
      'pau-uniswap-v3-swap',
    ]) {
      const decoded = decoder.decode(agentCallFromFixture(name));
      const rendered = [
        decoded.main.explanation,
        ...decoded.main.parameters.map(p => String(p.value)),
        ...decoded.nested!.flatMap(call => [
          call.explanation,
          ...call.parameters.map(p => String(p.value)),
        ]),
      ].join('\n');
      expect(rendered).not.toContain('…');
      expect(rendered).not.toContain('...');
    }
  });
});

describe('a Controller this build holds no table for', () => {
  const UNKNOWN_CONTROLLER = '0x0DD65461610Fe5b65cE50A870B10ED0F3d24d8C2';
  const decoded = decoder.decode(
    batchCall([{ target: UNKNOWN_CONTROLLER, data: '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a' }])
  );
  const call = decoded.nested![0]!;

  it('refuses to name the call', () => {
    expect(call.name).toBe('unknown Controller');
    expect(call.riskLevel).toBe('high');
  });

  it('tells the signer how to resolve the selector themselves', () => {
    expect(call.explanation).toContain('Read getDispatch(');
    expect(call.explanation).toContain('before signing');
  });

  it('renders the target, the selector and the full calldata', () => {
    expect(call.explanation).toContain(UNKNOWN_CONTROLLER);
    expect(call.explanation).toContain('0xa5b7e02d');
    expect(call.target).toBe(UNKNOWN_CONTROLLER);
    expect(call.rawCalldata).toBe(
      '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a'
    );
  });

  it('lifts the warning onto the batch, which is where the UI renders it', () => {
    expect(decoded.main.riskLevel).toBe('high');
    expect(decoded.main.warnings!.join('\n')).toContain(UNKNOWN_CONTROLLER);
  });
});

describe('a call selector the frozen table does not hold', () => {
  const decoded = decoder.decode(
    batchCall([{ target: GROVE_CONTROLLER, data: '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001' }])
  );
  const call = decoded.nested![0]!;

  it('refuses to name the call', () => {
    expect(call.name).toBe('unknown call selector');
    expect(call.riskLevel).toBe('high');
  });

  it('says the mapping is on-chain state and names the frozen block', () => {
    expect(call.explanation).toContain('Read getDispatch(');
    expect(call.explanation).toMatch(/frozen at block \d+/);
    expect(call.explanation).toContain('0xdeadbeef');
    expect(call.explanation).toContain(GROVE_CONTROLLER);
  });

  it('tells the signer which read settles it', () => {
    expect(call.explanation).toContain('getDispatch(0xdeadbeef)');
  });
});

describe('setMaxSlippage rendering', () => {
  const setMaxSlippage = (value: bigint) =>
    ('0x140aad6a' +
      AUSD_USDC_POOL.slice(2).toLowerCase().padStart(64, '0') +
      value.toString(16).padStart(64, '0')) as Hex;

  it('renders 0.999e18 with the inverted meaning stated', () => {
    const decoded = decoder.decode(
      batchCall([{ target: GROVE_CONTROLLER, data: setMaxSlippage(999000000000000000n) }])
    );
    const call = decoded.nested![0]!;
    expect(call.signature).toBe('setMaxSlippage(address,uint256)');
    expect(paramValue(call, 'maxSlippage')).toContain('999000000000000000');
    expect(paramValue(call, 'maxSlippage')).toContain('at least 99.9% of expected');
    expect(call.explanation).toContain('keyed by pool, not token');
    expect(call.warnings).toEqual([]);
  });

  it('warns that 0 disables the integration rather than forbidding slippage', () => {
    const decoded = decoder.decode(
      batchCall([{ target: GROVE_CONTROLLER, data: setMaxSlippage(0n) }])
    );
    const call = decoded.nested![0]!;
    expect(paramValue(call, 'maxSlippage')).toContain('unset');
    expect(call.warnings!.join('\n')).toContain('does NOT mean zero tolerance');
    // The UI renders the batch's warnings, not a nested call's, so it must land there too.
    expect(decoded.main.warnings!.join('\n')).toContain('does NOT mean zero tolerance');
  });

  it('applies the same reading to the AaveFacet on the second Controller', () => {
    // AaveFacet.setMaxSlippage carries the same delegate selector 0x73d76dbe as
    // the UniswapV3Facet's, at a different call selector, on a different
    // Controller. Its source computes the same minimum-fraction check.
    const data = ('0x0c61b8e5' +
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        ['0x1111111111111111111111111111111111111111', 995000000000000000n]
      ).slice(2)) as Hex;
    const decoded = decoder.decode(
      batchCall([{ target: '0x24169Afb34fAe4D4356BC54Bd80319131e35ca38', data }])
    );
    const call = decoded.nested![0]!;
    expect(call.signature).toBe('setMaxSlippage(address,uint256)');
    expect(call.explanation).toContain('(AaveFacet)');
    // A different facet from the UniswapV3Facet entry above, under the same
    // delegate selector 0x73d76dbe.
    expect(call.explanation).not.toContain(UNISWAP_V3_FACET);
    expect(paramValue(call, 'maxSlippage')).toContain('at least 99.5% of expected');
    expect(call.explanation).toContain('keyed by the aToken, not the underlying token');
  });

  it('renders 1e18 as no slippage allowed', () => {
    const decoded = decoder.decode(
      batchCall([{ target: GROVE_CONTROLLER, data: setMaxSlippage(10n ** 18n) }])
    );
    expect(paramValue(decoded.nested![0]!, 'maxSlippage')).toContain('no slippage allowed');
  });
});

describe('tick bounds and TWAP windows', () => {
  it('shows a negative int24 tick bound as its raw value with the type stated', () => {
    const data = ('0x59301309' +
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'int24' }],
        [AUSD_USDC_POOL, -276330]
      ).slice(2)) as Hex;
    const decoded = decoder.decode(batchCall([{ target: GROVE_CONTROLLER, data }]));
    const call = decoded.nested![0]!;
    expect(call.signature).toBe('setLiquidityLowerTickBound(address,int24)');
    expect(paramValue(call, 'lowerTickBound')).toBe('-276330');
    expect(call.parameters.find(p => p.name === 'lowerTickBound')!.type).toBe('int24');
    expect(call.explanation).toContain('a Uniswap v3 tick, not a price');
  });

  it('shows a uint32 TWAP window as its raw value with the type stated', () => {
    const data = ('0x3c32faa3' +
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint32' }],
        [AUSD_USDC_POOL, 3600]
      ).slice(2)) as Hex;
    const decoded = decoder.decode(batchCall([{ target: GROVE_CONTROLLER, data }]));
    const call = decoded.nested![0]!;
    expect(call.signature).toBe('setTWAPSecondsAgo(address,uint32)');
    expect(paramValue(call, 'twapSecondsAgo')).toBe('3600');
    expect(call.explanation).toContain('TWAP lookback window, in seconds');
  });
});

describe('batch-level checks', () => {
  it('warns when a call forwards ETH', () => {
    const decoded = decoder.decode(
      batchCall([
        {
          target: GROVE_CONTROLLER,
          data: '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a',
          value: 1n,
        },
      ])
    );
    expect(decoded.main.warnings!.join('\n')).toContain('forwards ETH');
  });

  it('flags a call with no 4-byte selector', () => {
    const decoded = decoder.decode(batchCall([{ target: GROVE_CONTROLLER, data: '0x' }]));
    expect(decoded.nested![0]!.name).toBe('call with no selector');
    expect(decoded.nested![0]!.riskLevel).toBe('high');
  });

  it('reports trailing calldata rather than decoding around it', () => {
    const clean = batchCall([
      {
        target: GROVE_CONTROLLER,
        data: '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a',
      },
    ]);
    const decoded = decoder.decode((clean + 'deadbeef') as Hex);
    expect(decoded.main.warnings!.join('\n')).toMatch(/Extra|trailing/i);
  });

  it('carries no per-call rows, so a call is never listed twice', () => {
    const decoded = decoder.decode(
      batchCall([
        {
          target: GROVE_CONTROLLER,
          data: '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a',
        },
        {
          target: GROVE_CONTROLLER,
          data: '0x48d63a13000000000000000000000000000000000000000000000000000000000000002a',
        },
      ])
    );
    expect(decoded.main.signature).toBe('batchCall(address[],bytes[],uint256[])');
    // Only the count. Every other fact about a call belongs to that call.
    expect(decoded.main.parameters.map((p) => p.name)).toEqual(['calls']);
    expect(String(decoded.main.parameters[0]!.value)).toBe('2');
    expect(decoded.nested!.map((call) => call.rawCalldata)).toEqual([
      '0xa5b7e02d000000000000000000000000000000000000000000000000000000000000002a',
      '0x48d63a13000000000000000000000000000000000000000000000000000000000000002a',
    ]);
  });

  it('exposes only batchCall as supported', () => {
    expect(decoder.getSupportedFunctions()).toEqual(['batchCall']);
  });
});

/** The rendered value of one named parameter, as a string. */
function paramValue(call: { parameters: Array<{ name: string; value: unknown }> }, name: string): string {
  const param = call.parameters.find(candidate => candidate.name === name);
  if (!param) throw new Error(`no parameter named ${name}`);
  return String(param.value);
}
