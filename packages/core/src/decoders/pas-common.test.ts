/**
 * Tests for the PAS rate-limit key resolver and formatters.
 *
 * The hash literals asserted here are pinned on purpose. `rateLimitBaseHash`
 * computes them from the name string at runtime, so these assertions are the
 * thing that would catch a name being edited — a silent rename would otherwise
 * change the hash and the decoder would simply stop resolving a key it used to
 * resolve, with no test failing.
 */

import { describe, it, expect } from 'vitest';
import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from 'viem';
import {
  RATE_LIMIT_KEYS,
  UINT256_MAX,
  formatRateLimitAmount,
  formatRateLimitSlope,
  isUnlimitedAmount,
  rateLimitBaseHash,
  unsearchableShapeReason,
  resolveRateLimitKey,
} from './pas-common.js';

const USDS = '0xdC035D45d973E3EC169d2276DDab16f1e407384F';
const SUSDS = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD';

const CANDIDATES = [
  { address: USDS as `0x${string}`, label: 'USDS' },
  { address: SUSDS as `0x${string}`, label: 'sUSDS' },
];

describe('rateLimitBaseHash', () => {
  // Pinned against keccak256 of the name string. These are the two keys
  // actually set on the Grove RateLimits contract as of 2026-08-17.
  it('should hash LIMIT_USDS_MINT to its known value', () => {
    expect(rateLimitBaseHash('LIMIT_USDS_MINT')).toBe(
      '0xcb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c'
    );
  });

  it('should hash LIMIT_USDS_TO_USDC to its known value', () => {
    expect(rateLimitBaseHash('LIMIT_USDS_TO_USDC')).toBe(
      '0x00d4cb8ac2838f11d95b0136a919a13b994f920024aba35eee16dc433c65851c'
    );
  });

  it('should hash LIMIT_4626_DEPOSIT to its known value', () => {
    expect(rateLimitBaseHash('LIMIT_4626_DEPOSIT')).toBe(
      '0xc80e541ae8dbb00d82e12edc8dbc29e6ae9ebed737088df9145797f7edca3b42'
    );
  });
});

describe('RATE_LIMIT_KEYS', () => {
  it('should not contain duplicate names', () => {
    const names = RATE_LIMIT_KEYS.map(k => k.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should not contain colliding base hashes', () => {
    const hashes = RATE_LIMIT_KEYS.map(k => rateLimitBaseHash(k.name));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('should give every key a non-empty summary', () => {
    for (const key of RATE_LIMIT_KEYS) {
      expect(key.summary.length).toBeGreaterThan(0);
    }
  });

  it('should record the PSM swap keys as USDC-denominated, not USDS', () => {
    // Both PSM facet swaps take a `usdcAmount`, in either direction. Reading
    // either key name and assuming 18 decimals misreads the amount by 10^12.
    for (const name of ['LIMIT_USDS_TO_USDC', 'LIMIT_USDC_TO_USDS']) {
      const key = RATE_LIMIT_KEYS.find(k => k.name === name);
      expect(key!.denomination!.symbol).toBe('USDC');
      expect(key!.denomination!.decimals).toBe(6);
    }
  });

  it('should carry diamond-pau shapes, not spark-alm-controller ones', () => {
    // These three differ between the two repositories for the same key name.
    // Taking spark's shape yields a hash that matches nothing on a Grove PAU.
    const shapesOf = (name: string) => RATE_LIMIT_KEYS.find(k => k.name === name)!.shapes;

    expect(shapesOf('LIMIT_4626_DEPOSIT')).toContain('address+address');
    expect(shapesOf('LIMIT_AAVE_DEPOSIT')).toContain('address+address+address');
    expect(shapesOf('LIMIT_UNISWAP_V4_SWAP')).toContain('address+bytes32');
  });

  it('should split the operations spark-alm-controller combines', () => {
    // spark reuses LIMIT_USDS_MINT for burning and LIMIT_USDS_TO_USDC for both
    // swap directions. diamond-pau gives each its own key, and both of the
    // extra keys are live on Grove's RateLimits.
    for (const name of ['LIMIT_USDS_BURN', 'LIMIT_USDC_TO_USDS']) {
      expect(RATE_LIMIT_KEYS.find(k => k.name === name)).toBeDefined();
    }
  });

  it('should denominate the Basin keys by their asset operand', () => {
    // BasinFacet rate-limits `amount` of `asset`, and `asset` is operand 0.
    for (const name of ['LIMIT_BASIN_DEPOSIT', 'LIMIT_BASIN_WITHDRAW']) {
      const key = RATE_LIMIT_KEYS.find(k => k.name === name)!;
      expect(key.shapes).toEqual(['address+address']);
      expect(key.denominationOperand).toBe(0);
      expect(key.denomination).toBeUndefined();
    }
  });

  it('should leave operand-scoped keys without a denomination', () => {
    // Their scale follows the token they are scoped to, which this table does
    // not record. A guess there would put a wrong number in front of a signer.
    for (const name of ['LIMIT_4626_DEPOSIT', 'LIMIT_AAVE_WITHDRAW', 'LIMIT_CURVE_SWAP']) {
      const key = RATE_LIMIT_KEYS.find(k => k.name === name);
      expect(key!.denomination).toBeUndefined();
    }
  });
});

describe('resolveRateLimitKey', () => {
  it('should resolve a bare key with no candidates supplied', () => {
    const resolved = resolveRateLimitKey(rateLimitBaseHash('LIMIT_USDS_MINT'));

    expect(resolved!.definition.name).toBe('LIMIT_USDS_MINT');
    expect(resolved!.operands).toEqual([]);
  });

  it('should resolve an address-scoped key by recomputing the preimage', () => {
    const key = keccak256(
      encodeAbiParameters(parseAbiParameters('bytes32, address'), [
        rateLimitBaseHash('LIMIT_4626_WITHDRAW'),
        SUSDS,
      ])
    );

    const resolved = resolveRateLimitKey(key, CANDIDATES);

    expect(resolved!.definition.name).toBe('LIMIT_4626_WITHDRAW');
    expect(resolved!.operands[0]).toContain(SUSDS);
    expect(resolved!.operands[0]).toContain('sUSDS');
  });

  it('should not resolve a key built with the wrong shape for its name', () => {
    // LIMIT_4626_DEPOSIT is keyed by two addresses in diamond-pau. Building it
    // spark-style with one address must fail to resolve rather than match.
    const sparkStyle = keccak256(
      encodeAbiParameters(parseAbiParameters('bytes32, address'), [
        rateLimitBaseHash('LIMIT_4626_DEPOSIT'),
        SUSDS,
      ])
    );

    expect(resolveRateLimitKey(sparkStyle, CANDIDATES)).toBeNull();
  });

  it('should resolve a two-address key in the right operand order', () => {
    const key = keccak256(
      encodeAbiParameters(parseAbiParameters('bytes32, address, address'), [
        rateLimitBaseHash('LIMIT_ASSET_TRANSFER'),
        USDS,
        SUSDS,
      ])
    );

    const resolved = resolveRateLimitKey(key, CANDIDATES);

    expect(resolved!.definition.name).toBe('LIMIT_ASSET_TRANSFER');
    expect(resolved!.operands[0]).toContain(USDS);
    expect(resolved!.operands[1]).toContain(SUSDS);
  });

  it('should resolve a uint32 CCTP domain key', () => {
    const key = keccak256(
      encodeAbiParameters(parseAbiParameters('bytes32, uint32'), [
        rateLimitBaseHash('LIMIT_USDC_TO_DOMAIN'),
        6,
      ])
    );

    const resolved = resolveRateLimitKey(key, CANDIDATES);

    expect(resolved!.definition.name).toBe('LIMIT_USDC_TO_DOMAIN');
    expect(resolved!.operands[0]).toBe('domain 6');
  });

  it('should return null for an address-scoped key whose operand is not a candidate', () => {
    const key = keccak256(
      encodeAbiParameters(parseAbiParameters('bytes32, address'), [
        rateLimitBaseHash('LIMIT_4626_DEPOSIT'),
        '0x000000000000000000000000000000000000dEaD',
      ])
    );

    // Unresolvable is not the same as invalid — the caller must say so.
    expect(resolveRateLimitKey(key, CANDIDATES)).toBeNull();
  });

  it('should return null for an arbitrary bytes32', () => {
    expect(resolveRateLimitKey(('0x' + '11'.repeat(32)) as Hex, CANDIDATES)).toBeNull();
  });

  it('should never resolve a key to a name whose preimage does not reproduce it', () => {
    // Property check across the whole table: every claimed resolution must
    // round-trip back to the exact bytes32 that was looked up.
    for (const definition of RATE_LIMIT_KEYS) {
      if (definition.shape !== 'bare') continue;
      const key = rateLimitBaseHash(definition.name);
      const resolved = resolveRateLimitKey(key, CANDIDATES);
      expect(resolved).not.toBeNull();
      expect(rateLimitBaseHash(resolved!.definition.name)).toBe(key);
    }
  });
});

describe('resolveRateLimitKey — Grove\'s live key set', () => {
  // Every rate-limit key set on Grove's RateLimits
  // 0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1, read from chain on 2026-08-20.
  // If any stops resolving, a signer is left matching a bare bytes32 by hand.
  const GROVE_CANDIDATES = [
    { address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F' as `0x${string}`, label: 'USDS', decimals: 18 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`, label: 'USDC', decimals: 6 },
    { address: '0xf08943f817e1F902dEbC884c7B19Ea5764594Ac9' as `0x${string}`, label: 'JTRSY Grove Basin' },
    { address: '0xCBa428fB052B365557DAf52b744DFfF20d5FbEdD' as `0x${string}`, label: 'BUIDL Grove Basin' },
    { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' as `0x${string}`, label: 'AUSD', decimals: 6 },
    { address: '0xbAFeAd7c60Ea473758ED6c6021505E8BBd7e8E5d' as `0x${string}`, label: 'Uniswap v3 AUSD/USDC' },
  ];

  const LIVE: Array<[Hex, string, string | undefined]> = [
    ['0xcb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c', 'LIMIT_USDS_MINT', 'USDS'],
    ['0x844d35ae585cfdeed0a77b7724286a1d4b5718bf8663d85e55396062b1cbe38c', 'LIMIT_USDS_BURN', 'USDS'],
    ['0x00d4cb8ac2838f11d95b0136a919a13b994f920024aba35eee16dc433c65851c', 'LIMIT_USDS_TO_USDC', 'USDC'],
    ['0x87835797fec2ad9575bc1a7035e3c27b8a8b7db2c3d7118513baf081b3af06b3', 'LIMIT_USDC_TO_USDS', 'USDC'],
    ['0x44ad4f925dffddd260f6ba5813208bf35b11b254e79611cbc8443c1504f68e68', 'LIMIT_BASIN_DEPOSIT', 'USDS'],
    ['0x1a86f9199a894b97364bd328ccf0a718073f81ec34f7febd5303937f8cacd73c', 'LIMIT_BASIN_DEPOSIT', 'USDS'],
    ['0x0d8db6f922b464d5eb8ac718bef62b82b05d9bd0ea5dafd09ccd0461d4d98e12', 'LIMIT_BASIN_WITHDRAW', 'USDS'],
    ['0xdfd7309f2f1b84a83ada77042d91e79a9cb3daf3ecd4c5335dede65b95c888f5', 'LIMIT_BASIN_WITHDRAW', 'USDC'],
    ['0xac6b1419c7365d44c458289fbd4b91c1913427601113863b9293594a6885baff', 'LIMIT_BASIN_WITHDRAW', 'USDS'],
    ['0x85d9f9cee2ba35ec7240969418f2edcc157ced3dfc6c1b85aa986a1b3026d4b7', 'LIMIT_BASIN_WITHDRAW', 'USDC'],
    // Uniswap v3. The same name at two arities: keyed by the pool alone it
    // meters a 1e18-normalised sum across both tokens; keyed by token and pool
    // it meters raw 6-decimal token amounts. Reading one as the other is a
    // factor of 10^12.
    ['0xd3384d5424cd179640223010fed859f38b86b26e5e0b9ee88b87321b98882f57', 'LIMIT_UNISWAP_V3_DEPOSIT', 'normalised'],
    ['0x89c0cb8c17898781d7c1776eafcf73fd0b570659ad5c3791ddcbefe66b001541', 'LIMIT_UNISWAP_V3_DEPOSIT', 'AUSD'],
    ['0x71efb11b03476e40dcc1ade629d360114fcbf838d70a3211270f69414ba9a187', 'LIMIT_UNISWAP_V3_DEPOSIT', 'USDC'],
    ['0xbe8cbf4b779bbe60101d88f64a8afcc8fdf78863df4303da9047b66fcf427734', 'LIMIT_UNISWAP_V3_WITHDRAW', 'normalised'],
    ['0xf353a8cb19089be9c21260f788c98069b2cef6a8a4bf9d061b3e5e7629a85671', 'LIMIT_UNISWAP_V3_WITHDRAW', 'AUSD'],
    ['0x17c7a2da0785bd1ad67b8207080dbc243cfc4e573cbac18a68d0bd4b788a1dfc', 'LIMIT_UNISWAP_V3_WITHDRAW', 'USDC'],
    ['0x7dd93dac252469b97c259284118454a6a09efd0e5f781dec59acc240f8f88402', 'LIMIT_UNISWAP_V3_SWAP', 'AUSD'],
    ['0x6e850dcb18bea10055c82d1e3753f551b1228d04b81350ba117235de19f9a0da', 'LIMIT_UNISWAP_V3_SWAP', 'USDC'],
  ];

  it('should resolve all eighteen', () => {
    for (const [key, name] of LIVE) {
      const resolved = resolveRateLimitKey(key, GROVE_CANDIDATES);
      expect(resolved, `unresolved: ${key}`).not.toBeNull();
      expect(resolved!.definition.name).toBe(name);
    }
  });

  it('should denominate each by the asset it actually counts', () => {
    // The same key name carries different decimals depending on its asset
    // operand: LIMIT_BASIN_WITHDRAW is USDS on one Basin and USDC on another.
    for (const [key, , symbol] of LIVE) {
      const resolved = resolveRateLimitKey(key, GROVE_CANDIDATES);
      expect(resolved!.denomination?.symbol, `wrong denomination for ${key}`).toBe(symbol);
    }
  });

  it('should distinguish the two arities of the same key name', () => {
    // The aggregate key and the per-token key share a name but are different
    // budgets with different scales. Resolving one as the other would misstate
    // the amount by 10^12.
    const aggregate = resolveRateLimitKey(
      '0xd3384d5424cd179640223010fed859f38b86b26e5e0b9ee88b87321b98882f57',
      GROVE_CANDIDATES
    )!;
    const perToken = resolveRateLimitKey(
      '0x89c0cb8c17898781d7c1776eafcf73fd0b570659ad5c3791ddcbefe66b001541',
      GROVE_CANDIDATES
    )!;

    expect(aggregate.definition.name).toBe(perToken.definition.name);
    expect(aggregate.shape).toBe('address');
    expect(perToken.shape).toBe('address+address');
    expect(aggregate.denomination!.decimals).toBe(18);
    expect(perToken.denomination!.decimals).toBe(6);
  });

  it('should reproduce each key exactly from the name it reports', () => {
    // A resolution is only meaningful if the reported preimage regenerates the
    // key. Bare keys are checked directly here.
    for (const [key, name] of LIVE) {
      const resolved = resolveRateLimitKey(key, GROVE_CANDIDATES)!;
      if (resolved.definition.shape !== 'bare') continue;
      expect(rateLimitBaseHash(name)).toBe(key);
    }
  });
});

describe('unsearchableShapeReason', () => {
  it('should return null for a shape the resolver can search', () => {
    expect(unsearchableShapeReason('bare')).toBeNull();
    expect(unsearchableShapeReason('address+address')).toBeNull();
  });

  it('should explain why an unbounded shape cannot be searched', () => {
    expect(unsearchableShapeReason('address+bytes32')).toContain('unbounded');
    expect(unsearchableShapeReason('address+uint16+address')).toContain('unbounded');
  });
});

describe('isUnlimitedAmount', () => {
  it('should recognise type(uint256).max', () => {
    expect(isUnlimitedAmount(UINT256_MAX)).toBe(true);
  });

  it('should not treat a merely large value as unlimited', () => {
    expect(isUnlimitedAmount(UINT256_MAX - 1n)).toBe(false);
    expect(isUnlimitedAmount(0n)).toBe(false);
  });
});

describe('formatRateLimitAmount', () => {
  const usds = { symbol: 'USDS', decimals: 18 };
  const usdc = { symbol: 'USDC', decimals: 6 };

  it('should label the unlimited sentinel and still show its full value', () => {
    const out = formatRateLimitAmount(UINT256_MAX);
    expect(out).toContain('UNLIMITED');
    expect(out).toContain(UINT256_MAX.toString());
  });

  it('should scale to whole tokens with grouping', () => {
    expect(formatRateLimitAmount(5_000_000_000_000_000_000_000_000n, usds)).toContain(
      '5,000,000 USDS'
    );
  });

  it('should apply 6 decimals for a USDC-denominated key', () => {
    expect(formatRateLimitAmount(5_000_000_000_000n, usdc)).toContain('5,000,000 USDC');
  });

  it('should always retain the raw integer', () => {
    expect(formatRateLimitAmount(5_000_000_000_000n, usdc)).toContain('5000000000000');
  });

  it('should say the denomination is undetermined rather than guess', () => {
    const out = formatRateLimitAmount(1234n);
    expect(out).toContain('1234');
    expect(out).toContain('denomination not determined');
  });
});

describe('formatRateLimitSlope', () => {
  const usds = { symbol: 'USDS', decimals: 18 };

  it('should call out a zero slope as never refilling', () => {
    expect(formatRateLimitSlope(0n)).toContain('never refills');
  });

  it('should convert units per second into units per day', () => {
    // 57870370370370370370 wei/s ≈ 5,000,000 USDS/day — the live Grove value
    const out = formatRateLimitSlope(57_870_370_370_370_370_370n, usds);
    expect(out).toContain('57870370370370370370 per second');
    expect(out).toContain('4,999,999.999999999999968');
    expect(out).toContain('USDS per day');
  });

  it('should treat a zero slope on an unlimited key as required, not as a hazard', () => {
    const out = formatRateLimitSlope(0n, usds, { unlimitedMax: true });
    expect(out).toContain('required for an unlimited key');
    expect(out).not.toContain('never refills');
  });

  it('should still give a per-day figure when the denomination is unknown', () => {
    const out = formatRateLimitSlope(100n);
    expect(out).toContain('100 per second');
    expect(out).toContain('8640000 per day');
  });
});
