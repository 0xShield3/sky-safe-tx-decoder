/**
 * Tests for Safe transaction hash calculation
 */

import { describe, it, expect } from 'vitest';
import { calculateSafeTxHash, verifySafeTxHash } from './calculator.js';
import type { SafeTransactionData } from '../types.js';

describe('calculateSafeTxHash', () => {
  it('should calculate correct hash for real Safe v1.3.0 transaction (nonce 434)', () => {
    // Real transaction from 0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d nonce 434
    // This is a multicall transaction that locks 54M SKY tokens
    const txData: SafeTransactionData = {
      to: '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3',
      value: '0',
      data: '0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000846c3dead4000000000000000000000000f65475e74c1ed6d004d5240b06e3088724dfda5d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002caaf1dd9f3a1ff6000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '434',
    };

    const result = calculateSafeTxHash(
      1, // Ethereum mainnet
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    // Expected hashes from actual Ledger device and Safe API
    expect(result.domainHash.toLowerCase()).toBe(
      '0xaf88393f1c14cf4d8f0b773c4f37cf80a29d606bed88e0fd8f61350debb3ac65'
    );
    expect(result.messageHash.toLowerCase()).toBe(
      '0x4d51fb13b155063239c656f466a7d1810bfa863edb4f96aad775643d4afe3675'
    );
    expect(result.safeTxHash.toLowerCase()).toBe(
      '0x57f5c1a8390932d29f5aa6e321a2e689c483a728fa5bccfc4ac7becb91239801'
    );
  });

  it('should calculate correct hash for Safe v1.3.0 with empty data', () => {
    // Simple ETH transfer (empty data)
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '1000000000000000000', // 1 ETH
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    const result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    // Should produce deterministic hashes
    expect(result.domainHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.messageHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.safeTxHash).toMatch(/^0x[a-f0-9]{64}$/i);

    // Hashes should be different from each other
    expect(result.domainHash).not.toBe(result.messageHash);
    expect(result.domainHash).not.toBe(result.safeTxHash);
    expect(result.messageHash).not.toBe(result.safeTxHash);
  });

  it('should handle Safe v1.2.0 (legacy domain hash without chainId)', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    const v120Result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.2.0'
    );

    const v130Result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    // Domain hash should be DIFFERENT between v1.2.0 and v1.3.0
    // because v1.2.0 doesn't include chainId
    expect(v120Result.domainHash).not.toBe(v130Result.domainHash);

    // Message hash should be the SAME (transaction data unchanged)
    expect(v120Result.messageHash).toBe(v130Result.messageHash);

    // Final Safe TX hash will be different due to different domain hash
    expect(v120Result.safeTxHash).not.toBe(v130Result.safeTxHash);
  });

  it('should handle Safe v1.2.0+L2 (strip L2 suffix)', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    // v1.2.0+L2 should behave the same as v1.2.0
    const v120L2Result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.2.0+L2'
    );

    const v120Result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.2.0'
    );

    expect(v120L2Result.domainHash).toBe(v120Result.domainHash);
    expect(v120L2Result.messageHash).toBe(v120Result.messageHash);
    expect(v120L2Result.safeTxHash).toBe(v120Result.safeTxHash);
  });

  it('should handle delegate call operation', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0xdeadbeef',
      operation: 1, // DelegateCall
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    const result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    expect(result.safeTxHash).toMatch(/^0x[a-f0-9]{64}$/i);
  });

  it('should handle custom gas parameters', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '100000',
      baseGas: '50000',
      gasPrice: '1000000000',
      gasToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      refundReceiver: '0x9876543210987654321098765432109876543210',
      nonce: '0',
    };

    const result = calculateSafeTxHash(
      1,
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    expect(result.safeTxHash).toMatch(/^0x[a-f0-9]{64}$/i);
  });

  it('should handle different chain IDs', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    const mainnetResult = calculateSafeTxHash(
      1, // Ethereum mainnet
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    const arbitrumResult = calculateSafeTxHash(
      42161, // Arbitrum One
      '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      txData,
      '1.3.0'
    );

    // Domain hash should be different (includes chainId)
    expect(mainnetResult.domainHash).not.toBe(arbitrumResult.domainHash);

    // Message hash should be the same (transaction data unchanged)
    expect(mainnetResult.messageHash).toBe(arbitrumResult.messageHash);

    // Final hash should be different
    expect(mainnetResult.safeTxHash).not.toBe(arbitrumResult.safeTxHash);
  });

  it('should throw error for unsupported version', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    expect(() => {
      calculateSafeTxHash(
        1,
        '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
        txData,
        '0.0.9' // Too old
      );
    }).toThrow('Safe multisig version "0.0.9" is not supported!');
  });

  it('should throw error for empty version', () => {
    const txData: SafeTransactionData = {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    };

    expect(() => {
      calculateSafeTxHash(
        1,
        '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
        txData,
        ''
      );
    }).toThrow('No Safe multisig contract found');
  });
});

describe('verifySafeTxHash', () => {
  it('should return true for matching hashes', () => {
    const hash = '0x57f5c1a8390932d29f5aa6e321a2e689c483a728fa5bccfc4ac7becb91239801';
    expect(verifySafeTxHash(hash, hash)).toBe(true);
  });

  it('should return true for matching hashes with different case', () => {
    const lowercase = '0x57f5c1a8390932d29f5aa6e321a2e689c483a728fa5bccfc4ac7becb91239801';
    const uppercase = '0x57F5C1A8390932D29F5AA6E321A2E689C483A728FA5BCCFC4AC7BECB91239801';
    expect(verifySafeTxHash(lowercase, uppercase)).toBe(true);
  });

  it('should return false for non-matching hashes', () => {
    const hash1 = '0x57f5c1a8390932d29f5aa6e321a2e689c483a728fa5bccfc4ac7becb91239801';
    const hash2 = '0x1234567890123456789012345678901234567890123456789012345678901234';
    expect(verifySafeTxHash(hash1, hash2)).toBe(false);
  });
});
