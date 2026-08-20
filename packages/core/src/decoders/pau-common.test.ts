/**
 * Tests for the shared PAU helpers.
 *
 * The max-slippage cases are the point of this file. The value is stored
 * INVERTED relative to the usual convention — it is the minimum acceptable
 * fraction of expected output, not the deviation allowed — so both readings of
 * the number fail dangerously in opposite directions. `0` is the worst of them:
 * the facet rejects it with max-slippage-not-set, and a signer applying the
 * usual convention reads it as maximum safety.
 */

import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import {
  comparePauDispatch,
  describeMaxSlippage,
  describePauDispatchMismatch,
  findPauControllerTable,
  findPauWire,
  readPauAmount,
  type PauWire,
} from './pau-common.js';
import { PAU_DISPATCH_TABLES } from './pau-dispatch-table.js';

const GROVE_CONTROLLER = '0xbf83F5974B932c7D842254042717D6A2706CE5eE';
const UNISWAP_V3_FACET = '0x445D9Dc752F269Be48250f1A180CAC4c61cE4bab';
const USDS = '0xdC035D45d973E3EC169d2276DDab16f1e407384F';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const groveTable = findPauControllerTable(PAU_DISPATCH_TABLES, GROVE_CONTROLLER)!;

describe('describeMaxSlippage', () => {
  it('reads 0.999e18 as a 0.1% tolerance, not 99.9% slippage', () => {
    const reading = describeMaxSlippage(999000000000000000n);
    expect(reading.value).toBe('999000000000000000');
    expect(reading.meaning).toContain('at least 99.9% of expected');
    expect(reading.meaning).toContain('0.1% tolerance');
    expect(reading.warning).toBeUndefined();
  });

  it('reads 1e18 as no slippage allowed', () => {
    const reading = describeMaxSlippage(1000000000000000000n);
    expect(reading.value).toBe('1000000000000000000');
    expect(reading.meaning).toContain('no slippage is allowed');
  });

  it('reads 0 as the unconfigured state, not zero tolerance', () => {
    const reading = describeMaxSlippage(0n);
    expect(reading.value).toBe('0');
    expect(reading.meaning).toContain('leaves the integration unconfigured');
    expect(reading.meaning).toContain('max-slippage-not-set');
    expect(reading.warning).toBeDefined();
    expect(reading.warning).toContain('does NOT mean zero slippage tolerance');
  });

  it('warns when the value is above 1e18, which reverts every call', () => {
    const reading = describeMaxSlippage(1000000000000000001n);
    expect(reading.warning).toContain('above 1e18');
    expect(reading.warning).toContain('1000000000000000001');
  });

  it('keeps the full raw integer for every case', () => {
    for (const value of [0n, 1n, 999000000000000000n, 10n ** 18n, 10n ** 18n + 1n]) {
      expect(describeMaxSlippage(value).value).toBe(value.toString());
    }
  });
});

describe('readPauAmount', () => {
  it('scales a USDS mint from the facet source', () => {
    const reading = readPauAmount('ethereum', 'USDSFacet', 'mint(uint256)', 0, 5000000000000000000000000n, []);
    expect(reading.scaled).toContain('5000000000000000000000000');
    expect(reading.scaled).toContain('5,000,000 USDS');
    // The label never stands alone.
    expect(reading.scaled).toContain(USDS);
    expect(reading.note).toBeNull();
  });

  it('scales a PSM swap in USDC, not in the token being received', () => {
    const reading = readPauAmount('ethereum', 'PSMFacet', 'swapUSDCToUSDS(uint256)', 0, 5000000000000n, []);
    expect(reading.scaled).toContain('5,000,000 USDC');
    expect(reading.scaled).toContain(USDC);
  });

  it('takes a Basin amount from the asset in parameter 1, not the Basin in parameter 0', () => {
    const reading = readPauAmount(
      'ethereum',
      'BasinFacet',
      'deposit(address,address,uint256,uint256)',
      2,
      1000000000000000000n,
      ['0xf08943f817e1F902dEbC884c7B19Ea5764594Ac9', USDS, 1000000000000000000n, 0n]
    );
    expect(reading.scaled).toContain('1 USDS');
    expect(reading.scaled).toContain(USDS);
  });

  it('states the scale is undetermined for an amount the facet source does not pin', () => {
    const reading = readPauAmount(
      'ethereum',
      'UniswapV3Facet',
      'swap(address,address,uint256,uint256,uint24)',
      2,
      750000000000n,
      []
    );
    expect(reading.scaled).toBeNull();
    // A bare clause. The caller composes the sentence, so the reason is not
    // repeated once per parameter.
    expect(reading.note).toBe('counts units of tokenIn');
  });

  it('says nothing about scale for a parameter that is not an amount', () => {
    // addLiquidity's deadline is a unix timestamp and its tokenId is a position
    // identifier. Calling their denomination undetermined would be noise.
    const signature =
      'addLiquidity(address,uint256,(int24,int24),(uint256,uint256),(uint256,uint256),uint256)';
    for (const index of [1, 5]) {
      const reading = readPauAmount('ethereum', 'UniswapV3Facet', signature, index, 1787187563n, []);
      expect(reading.scaled).toBeNull();
      expect(reading.note).toBeNull();
    }
  });

  it('leaves a Basin amount unscaled when the asset is not a known token', () => {
    const reading = readPauAmount(
      'ethereum',
      'BasinFacet',
      'deposit(address,address,uint256,uint256)',
      2,
      1000n,
      ['0xf08943f817e1F902dEbC884c7B19Ea5764594Ac9', '0x1111111111111111111111111111111111111111', 1000n, 0n]
    );
    expect(reading.scaled).toBeNull();
    expect(reading.note).toContain('the asset named by parameter 1');
    expect(reading.note).toContain('0x1111111111111111111111111111111111111111');
  });

  it('does not scale a facet function that shares a name with a denominated one', () => {
    // AaveFacet.deposit(address aToken, uint256 amount) counts aTokens. The
    // denomination table is keyed by facet name for exactly this reason.
    const reading = readPauAmount('ethereum', 'AaveFacet', 'deposit(address,uint256)', 1, 1000n, []);
    expect(reading.scaled).toBeNull();
    expect(reading.note).toContain('counts units of the aToken');
  });
});

describe('the frozen Grove dispatch table', () => {
  it('holds the 47 call selectors read from the Controller', () => {
    expect(groveTable.wires).toHaveLength(47);
  });

  it('records the block and date it was frozen at', () => {
    expect(groveTable.frozenAtBlock).toBeGreaterThan(0);
    expect(groveTable.frozenAtDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * Pinned as literals. The table is generated, so a regeneration that changed
   * one of these silently would otherwise pass — and a changed entry is the one
   * failure mode that produces a confident wrong label rather than no label.
   */
  it('maps call selector 0x140aad6a to setMaxSlippage on the UniswapV3Facet', () => {
    const wire = findPauWire(groveTable, '0x140aad6a')!;
    expect(wire.delegateSelector).toBe('0x73d76dbe');
    expect(wire.signature).toBe('setMaxSlippage(address,uint256)');
    expect(wire.facet).toBe(UNISWAP_V3_FACET);
    expect(wire.facetName).toBe('UniswapV3Facet');
  });

  it('maps call selector 0xa5b7e02d to mint on the USDSFacet', () => {
    const wire = findPauWire(groveTable, '0xa5b7e02d')!;
    expect(wire.delegateSelector).toBe('0xa0712d68');
    expect(wire.signature).toBe('mint(uint256)');
    expect(wire.integrationLabel).toBe('USDS_FACET');
  });

  it('never wires a call selector to its own delegate selector', () => {
    // The whole reason this table has to exist: the selector sent is not the
    // selector executed, so no ABI lookup can resolve one of these calls.
    for (const wire of groveTable.wires) {
      expect(wire.callSelector).not.toBe(wire.delegateSelector);
    }
  });

  it('resolves selectors case-insensitively', () => {
    expect(findPauWire(groveTable, '0x140AAD6A')?.signature).toBe('setMaxSlippage(address,uint256)');
    expect(findPauControllerTable(PAU_DISPATCH_TABLES, GROVE_CONTROLLER.toLowerCase())).toBe(groveTable);
  });

  it('covers the second active Controller as well', () => {
    const other = findPauControllerTable(
      PAU_DISPATCH_TABLES,
      '0x24169Afb34fAe4D4356BC54Bd80319131e35ca38'
    );
    expect(other).toBeDefined();
    expect(other!.wires.length).toBeGreaterThan(0);
  });
});

describe('comparePauDispatch', () => {
  const wire: PauWire = findPauWire(groveTable, '0x140aad6a')!;

  it('reports no mismatch when the chain agrees', () => {
    expect(
      comparePauDispatch(wire, {
        facet: wire.facet,
        delegateSelector: wire.delegateSelector,
      })
    ).toBeNull();
  });

  it('ignores case differences in the chain answer', () => {
    expect(
      comparePauDispatch(wire, {
        facet: wire.facet.toLowerCase() as `0x${string}`,
        delegateSelector: wire.delegateSelector.toUpperCase().replace('0X', '0x') as Hex,
      })
    ).toBeNull();
  });

  it('reports a changed facet', () => {
    const mismatch = comparePauDispatch(wire, {
      facet: '0x1111111111111111111111111111111111111111',
      delegateSelector: wire.delegateSelector,
    })!;
    expect(mismatch.kind).toBe('facet');
    expect(mismatch.frozenFacet).toBe(UNISWAP_V3_FACET);
    expect(mismatch.onChainFacet).toBe('0x1111111111111111111111111111111111111111');
  });

  it('reports a changed delegate selector', () => {
    const mismatch = comparePauDispatch(wire, {
      facet: wire.facet,
      delegateSelector: '0xdeadbeef',
    })!;
    expect(mismatch.kind).toBe('delegate-selector');
    expect(mismatch.frozenDelegateSelector).toBe('0x73d76dbe');
    expect(mismatch.onChainDelegateSelector).toBe('0xdeadbeef');
  });

  it('reports both when both changed', () => {
    const mismatch = comparePauDispatch(wire, {
      facet: '0x1111111111111111111111111111111111111111',
      delegateSelector: '0xdeadbeef',
    })!;
    expect(mismatch.kind).toBe('facet-and-delegate-selector');
  });

  it('reports a selector that is no longer wired', () => {
    const mismatch = comparePauDispatch(wire, {
      facet: '0x0000000000000000000000000000000000000000',
      delegateSelector: '0x00000000',
    })!;
    expect(mismatch.kind).toBe('not-wired');
    expect(mismatch.onChainFacet).toBeNull();
  });

  it('describes a mismatch with both values in full', () => {
    const mismatch = comparePauDispatch(wire, {
      facet: '0x1111111111111111111111111111111111111111',
      delegateSelector: '0xdeadbeef',
    })!;
    const text = describePauDispatchMismatch(mismatch);
    expect(text).toContain('0x140aad6a');
    expect(text).toContain(UNISWAP_V3_FACET);
    expect(text).toContain('0x1111111111111111111111111111111111111111');
    expect(text).toContain('0x73d76dbe');
    expect(text).toContain('0xdeadbeef');
    expect(text).not.toContain('…');
  });
});
