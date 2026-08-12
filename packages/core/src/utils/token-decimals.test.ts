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

  it('hints for approve and the allowance adjusters', () => {
    expect(q({ signature: 'approve(address,uint256)' })).toBe(18);
    expect(q({ signature: 'increaseAllowance(address,uint256)' })).toBe(18);
    expect(q({ signature: 'decreaseAllowance(address,uint256)' })).toBe(18);
  });

  it('does not hint for transferFrom — deliberately outside the allowlist', () => {
    const sig = 'transferFrom(address,address,uint256)';
    expect(q({ signature: sig, paramIndex: 2 })).toBeNull();
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

describe('no ERC-4626 vault function preselects a scale', () => {
  // sUSDS is a registry token AND a vault, so it is the case where a vault
  // function could pick up a hint if the allowlist let it. None may.
  //
  // The denominator differs per function — deposit/withdraw are in the
  // underlying asset, mint/redeem are in shares — and the registry records only
  // the vault's own decimals. Correct today for sUSDS over USDS (both 18),
  // wrong for an 18-decimal vault over a 6-decimal asset, where 1 unit of the
  // asset would render as 0.000000000001. The tool does not guess.
  const SUSDS = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD';
  const hint = (signature: string, paramIndex: number) =>
    getAmountDecimalsHint({ network: 'ethereum', to: SUSDS, signature, paramIndex, paramType: 'uint256' });

  it('does not hint asset-denominated deposit or withdraw', () => {
    expect(hint('deposit(uint256,address)', 0)).toBeNull();
    expect(hint('withdraw(uint256,address,address)', 0)).toBeNull();
  });

  it('does not hint share-denominated mint or redeem', () => {
    expect(hint('mint(uint256,address)', 0)).toBeNull();
    expect(hint('redeem(uint256,address,address)', 0)).toBeNull();
  });

  it('still hints a plain ERC-20 transfer on the same contract', () => {
    // The vault is a token too. Excluding vault functions must not exclude the
    // ERC-20 surface it also exposes.
    expect(hint('transfer(address,uint256)', 1)).toBe(18);
  });
});
