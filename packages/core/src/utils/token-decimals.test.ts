import { describe, it, expect } from 'vitest';
import { getKnownTokenDecimals, getAmountDecimalsHint } from './token-decimals.js';
import { CONTRACTS_BY_NETWORK } from '../contracts/index.js';

const USDS = '0xdC035D45d973E3EC169d2276DDab16f1e407384F';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPBEAM = '0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22';

describe('getKnownTokenDecimals', () => {
  it('returns the hardcoded decimals for a known token', () => {
    expect(getKnownTokenDecimals('ethereum', USDS)).toBe(18);
    expect(getKnownTokenDecimals('ethereum', USDC)).toBe(6);
  });

  it('matches case-insensitively — calldata addresses are not checksummed', () => {
    expect(getKnownTokenDecimals('ethereum', USDC.toLowerCase())).toBe(6);
    expect(getKnownTokenDecimals('ethereum', USDC.toUpperCase().replace('0X', '0x'))).toBe(6);
  });

  it('returns null for a non-token contract', () => {
    expect(getKnownTokenDecimals('ethereum', SPBEAM)).toBeNull();
  });

  it('returns null for an unknown address', () => {
    expect(getKnownTokenDecimals('ethereum', '0x0000000000000000000000000000000000000001')).toBeNull();
  });

  it('returns null for an unknown network', () => {
    expect(getKnownTokenDecimals('dogechain', USDS)).toBeNull();
  });

  it('does not resolve an Ethereum token address against another network', () => {
    // Same address, different chain: a token on one chain is not the same
    // contract on another, so the hint must not leak across networks.
    expect(getKnownTokenDecimals('base', USDS)).toBeNull();
  });

  it('resolves Base-native USDC to 6 on base only', () => {
    const baseUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    expect(getKnownTokenDecimals('base', baseUsdc)).toBe(6);
    expect(getKnownTokenDecimals('ethereum', baseUsdc)).toBeNull();
  });
});

describe('getAmountDecimalsHint', () => {
  const q = (over: Partial<Parameters<typeof getAmountDecimalsHint>[0]> = {}) =>
    getAmountDecimalsHint({
      network: 'ethereum',
      to: USDS,
      signature: 'transfer(address,uint256)',
      paramIndex: 1,
      paramType: 'uint256',
      ...over,
    });

  it('hints the token decimals for the amount parameter of transfer', () => {
    expect(q()).toBe(18);
  });

  it('hints 6 for USDC', () => {
    expect(q({ to: USDC })).toBe(6);
  });

  it('does not hint for the recipient parameter of transfer', () => {
    expect(q({ paramIndex: 0, paramType: 'address' })).toBeNull();
  });

  it('hints only the amount position of transferFrom', () => {
    const sig = 'transferFrom(address,address,uint256)';
    expect(q({ signature: sig, paramIndex: 2 })).toBe(18);
    expect(q({ signature: sig, paramIndex: 0, paramType: 'address' })).toBeNull();
    expect(q({ signature: sig, paramIndex: 1, paramType: 'address' })).toBeNull();
  });

  it('hints for approve', () => {
    expect(q({ signature: 'approve(address,uint256)' })).toBe(18);
  });

  it('does not hint for a function outside the allowlist', () => {
    // permit's deadline is a timestamp — scaling it by 1e18 is nonsense.
    expect(
      q({ signature: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', paramIndex: 3 })
    ).toBeNull();
  });

  it('does not hint when the call target is not a known token', () => {
    // A router call carries amounts denominated in tokens named in its
    // parameters, not in the target.
    expect(q({ to: '0x0000000000000000000000000000000000000001' })).toBeNull();
    expect(q({ to: SPBEAM })).toBeNull();
  });

  it('does not hint for non-integer parameter types', () => {
    expect(q({ paramType: 'bytes32' })).toBeNull();
    expect(q({ paramType: 'address' })).toBeNull();
    expect(q({ paramType: 'bool' })).toBeNull();
  });

  it('does not hint for signed integers', () => {
    expect(q({ paramType: 'int256' })).toBeNull();
  });

  it('accepts narrower unsigned widths', () => {
    expect(q({ paramType: 'uint128' })).toBe(18);
  });

  it('tolerates surrounding whitespace in the signature and type', () => {
    expect(q({ signature: ' transfer(address,uint256) ', paramType: ' uint256 ' })).toBe(18);
  });

  it('is not fooled by a signature that merely contains an allowlisted one', () => {
    expect(q({ signature: 'evilTransfer(address,uint256)' })).toBeNull();
    expect(q({ signature: 'transfer(address,uint256) extra' })).toBeNull();
  });
});

describe('token registry integrity', () => {
  it('gives every token entry a decimals value in a plausible range', () => {
    for (const [network, contracts] of Object.entries(CONTRACTS_BY_NETWORK)) {
      for (const c of contracts) {
        if (c.category !== 'token') continue;
        if (c.decimals === undefined) continue;
        expect(Number.isInteger(c.decimals), `${network} ${c.label} decimals is an integer`).toBe(true);
        expect(c.decimals, `${network} ${c.label} decimals >= 0`).toBeGreaterThanOrEqual(0);
        expect(c.decimals, `${network} ${c.label} decimals <= 36`).toBeLessThanOrEqual(36);
      }
    }
  });

  it('declares no duplicate token addresses within a network', () => {
    for (const [network, contracts] of Object.entries(CONTRACTS_BY_NETWORK)) {
      const seen = new Set<string>();
      for (const c of contracts) {
        const key = c.address.toLowerCase();
        expect(seen.has(key), `${network} has a duplicate entry for ${c.address}`).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe('ERC-4626 asset-denominated entry points are excluded', () => {
  const SUSDS = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD';
  const hint = (signature: string, paramIndex: number) =>
    getAmountDecimalsHint({ network: 'ethereum', to: SUSDS, signature, paramIndex, paramType: 'uint256' });

  it('hints share-denominated mint and redeem — shares use the vault’s own decimals', () => {
    expect(hint('mint(uint256,address)', 0)).toBe(18);
    expect(hint('redeem(uint256,address,address)', 0)).toBe(18);
  });

  it('does not hint deposit or withdraw — those amounts are in the UNDERLYING asset', () => {
    // The call is addressed to the vault, so the registry would supply the
    // vault's decimals. That is only right while vault and asset agree. An
    // 18-decimal vault over a 6-decimal asset would render 1 unit of the asset
    // as 0.000000000001.
    expect(hint('deposit(uint256,address)', 0)).toBeNull();
    expect(hint('withdraw(uint256,address,address)', 0)).toBeNull();
  });
});
