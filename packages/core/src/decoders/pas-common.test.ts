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

  it('should record LIMIT_USDE_MINT as USDC-denominated, not USDe', () => {
    // prepareUSDeMint(uint256 usdcAmount) rate-limits the USDC it approves to
    // Ethena. Reading the key name and assuming 18 decimals misreads the
    // amount by a factor of 10^12.
    const key = RATE_LIMIT_KEYS.find(k => k.name === 'LIMIT_USDE_MINT');
    expect(key!.denomination).toEqual({
      symbol: 'USDC',
      decimals: 6,
      note: expect.stringContaining('not USDe'),
    });
  });

  it('should record LIMIT_OTC_SWAP as 18-decimal normalised regardless of asset', () => {
    const key = RATE_LIMIT_KEYS.find(k => k.name === 'LIMIT_OTC_SWAP');
    expect(key!.denomination!.decimals).toBe(18);
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
        rateLimitBaseHash('LIMIT_4626_DEPOSIT'),
        SUSDS,
      ])
    );

    const resolved = resolveRateLimitKey(key, CANDIDATES);

    expect(resolved!.definition.name).toBe('LIMIT_4626_DEPOSIT');
    expect(resolved!.operands[0]).toContain(SUSDS);
    expect(resolved!.operands[0]).toContain('sUSDS');
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
