/**
 * Tests for nested Safe (approveHash) transaction hash calculation
 */

import { describe, it, expect } from 'vitest';
import { toFunctionSelector } from 'viem';
import {
  APPROVE_HASH_SELECTOR,
  buildApproveHashCallData,
  buildApproveHashTransaction,
  calculateNestedSafeTxHash,
} from './nested.js';
import { calculateSafeTxHash } from './calculator.js';

// Real mainnet pair. 0xC3eA7C657884BB380B66D79C36aDCb5658b01896 is an owner of
// 0x1a37bF1Ccbf570C92FE2239FefaaAF861c2924DD, and approved that Safe's nonce-13
// transaction by executing its own nonce-13 approveHash transaction.
const PARENT_SAFE = '0x1a37bF1Ccbf570C92FE2239FefaaAF861c2924DD';
const NESTED_SAFE = '0xC3eA7C657884BB380B66D79C36aDCb5658b01896';
const PARENT_SAFE_TX_HASH = '0x7abc8c5239b0711daef70d9a06a37575632dc26f189b681759a9687ed3f747cc';
const NESTED_SAFE_TX_HASH = '0xcbd93de3e7cc17cd292719c38822128ebdfa4c532aa343180817499d1f3e9b34';

describe('APPROVE_HASH_SELECTOR', () => {
  it('is the selector of approveHash(bytes32)', () => {
    expect(APPROVE_HASH_SELECTOR).toBe(toFunctionSelector('approveHash(bytes32)'));
  });
});

describe('buildApproveHashCallData', () => {
  it('concatenates the selector and the full 32-byte parent hash', () => {
    expect(buildApproveHashCallData(PARENT_SAFE_TX_HASH)).toBe(
      '0xd4d9bdcd7abc8c5239b0711daef70d9a06a37575632dc26f189b681759a9687ed3f747cc'
    );
  });

  it('rejects a hash that is not 32 bytes', () => {
    expect(() => buildApproveHashCallData('0x7abc8c52')).toThrow(
      'approveHash requires a 32-byte hash'
    );
  });

  it('rejects a non-hex value', () => {
    expect(() => buildApproveHashCallData('not a hash' as `0x${string}`)).toThrow(
      'approveHash requires a 32-byte hash'
    );
  });
});

describe('buildApproveHashTransaction', () => {
  it('targets the parent Safe with zeroed gas and refund fields', () => {
    const tx = buildApproveHashTransaction({
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
      nestedSafeNonce: '13',
    });

    expect(tx).toEqual({
      to: PARENT_SAFE,
      value: '0',
      data: '0xd4d9bdcd7abc8c5239b0711daef70d9a06a37575632dc26f189b681759a9687ed3f747cc',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '13',
    });
  });

  it('accepts a bigint nonce', () => {
    const tx = buildApproveHashTransaction({
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
      nestedSafeNonce: 13n,
    });

    expect(tx.nonce).toBe('13');
  });
});

describe('calculateNestedSafeTxHash', () => {
  it('reproduces the safeTxHash of a real executed approveHash transaction', () => {
    // Nested Safe 0xC3eA7C657884BB380B66D79C36aDCb5658b01896 nonce 13,
    // executed 2026-05-11 in Ethereum transaction
    // 0x720d2c07ba366743a1bac6a7d91f5bc06176e870036eb7b4f5d52f3177d85dd5.
    const result = calculateNestedSafeTxHash({
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeNonce: '13',
      nestedSafeVersion: '1.4.1',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
    });

    expect(result.safeTxHash.toLowerCase()).toBe(NESTED_SAFE_TX_HASH);
  });

  it('reproduces a second real executed approveHash transaction', () => {
    // Same nested Safe, nonce 12, executed 2026-02-20 in Ethereum transaction
    // 0x24342681973b396064a0d75150717d4bb8415cc1a795a01e0ecfa6b452d7750b.
    const result = calculateNestedSafeTxHash({
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeNonce: '12',
      nestedSafeVersion: '1.4.1',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: '0x43d605526d7c8c3593f5e322eff65695191deed0dcd0d90349ba6a569d2e5396',
    });

    expect(result.safeTxHash.toLowerCase()).toBe(
      '0x55bf97dadbd3bf33b55745b88c0bb0c1727b58ee421610cde1f000d2386bfdc6'
    );
  });

  it('returns the approveHash transaction the hashes were derived from', () => {
    const result = calculateNestedSafeTxHash({
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeNonce: '13',
      nestedSafeVersion: '1.4.1',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
    });

    expect(result.transaction.to).toBe(PARENT_SAFE);
    expect(result.transaction.data).toBe(
      '0xd4d9bdcd7abc8c5239b0711daef70d9a06a37575632dc26f189b681759a9687ed3f747cc'
    );
    expect(result.transaction.nonce).toBe('13');
  });

  it('matches calculateSafeTxHash run on the same transaction struct', () => {
    const input = {
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeNonce: '13',
      nestedSafeVersion: '1.4.1',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
    } as const;

    const nested = calculateNestedSafeTxHash(input);
    const direct = calculateSafeTxHash(1, NESTED_SAFE, nested.transaction, '1.4.1');

    expect(nested.domainHash).toBe(direct.domainHash);
    expect(nested.messageHash).toBe(direct.messageHash);
    expect(nested.safeTxHash).toBe(direct.safeTxHash);
  });

  it('uses the nested Safe address, not the parent, in the domain hash', () => {
    const nested = calculateNestedSafeTxHash({
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeNonce: '13',
      nestedSafeVersion: '1.4.1',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
    });

    const asParent = calculateSafeTxHash(1, PARENT_SAFE, nested.transaction, '1.4.1');

    expect(nested.domainHash).not.toBe(asParent.domainHash);
  });

  it('changes the safeTxHash when the nested nonce changes', () => {
    const base = {
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeVersion: '1.4.1',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
    } as const;

    const at13 = calculateNestedSafeTxHash({ ...base, nestedSafeNonce: '13' });
    const at14 = calculateNestedSafeTxHash({ ...base, nestedSafeNonce: '14' });

    expect(at13.safeTxHash).not.toBe(at14.safeTxHash);
    expect(at13.domainHash).toBe(at14.domainHash);
  });

  describe('version differences', () => {
    // The parent above is 1.4.1. A nested Safe on an older version produces
    // different hashes from identical fields: <= 1.2.0 omits chainId from the
    // domain, and < 1.0.0 uses `dataGas` instead of `baseGas` in the type hash.
    const base = {
      chainId: 1,
      nestedSafeAddress: NESTED_SAFE,
      nestedSafeNonce: '13',
      parentSafeAddress: PARENT_SAFE,
      parentSafeTxHash: PARENT_SAFE_TX_HASH,
    } as const;

    it('omits chainId from the domain hash for a v1.2.0 nested Safe', () => {
      const v141 = calculateNestedSafeTxHash({ ...base, nestedSafeVersion: '1.4.1' });
      const v120 = calculateNestedSafeTxHash({ ...base, nestedSafeVersion: '1.2.0' });

      expect(v120.domainHash).not.toBe(v141.domainHash);
      // Same SafeTx type hash on both, so the message hash is unchanged.
      expect(v120.messageHash).toBe(v141.messageHash);
      expect(v120.safeTxHash).not.toBe(v141.safeTxHash);
    });

    it('uses the dataGas type hash for a v0.1.0 nested Safe', () => {
      const v141 = calculateNestedSafeTxHash({ ...base, nestedSafeVersion: '1.4.1' });
      const v010 = calculateNestedSafeTxHash({ ...base, nestedSafeVersion: '0.1.0' });

      expect(v010.messageHash).not.toBe(v141.messageHash);
      expect(v010.safeTxHash).not.toBe(v141.safeTxHash);
    });

    it('treats an +L2 suffix as the same version', () => {
      // The two version sources disagree on this suffix for real Safes: owner
      // 0x11cd09a0c5B1dc674615783b0772a9bFD53e3A8F reports "1.3.0" from its
      // on-chain VERSION() and "1.3.0+L2" from the Safe Transaction Service.
      // The suffix names the singleton, not the EIP-712 encoding, so whichever
      // source answered must not change the hashes a signer verifies.
      const plain = calculateNestedSafeTxHash({ ...base, nestedSafeVersion: '1.3.0' });
      const l2 = calculateNestedSafeTxHash({ ...base, nestedSafeVersion: '1.3.0+L2' });

      expect(l2.domainHash).toBe(plain.domainHash);
      expect(l2.messageHash).toBe(plain.messageHash);
      expect(l2.safeTxHash).toBe(plain.safeTxHash);
    });

    it('rejects an invalid nested Safe version', () => {
      expect(() =>
        calculateNestedSafeTxHash({ ...base, nestedSafeVersion: 'not-a-version' })
      ).toThrow();
    });
  });
});
