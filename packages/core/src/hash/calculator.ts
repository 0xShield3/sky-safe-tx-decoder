/**
 * Safe Transaction Hash Calculator
 *
 * Main entry point for calculating EIP-712 Safe transaction hashes.
 * Reference: safe_hashes.sh lines 603-685
 */

import { concat, keccak256, type Address, type Hex } from 'viem';
import type { SafeTransactionData } from '../types.js';
import { calculateDomainHash } from './domain.js';
import { calculateMessageHash } from './message.js';
import { validateVersion } from './version.js';

/**
 * Result of Safe transaction hash calculation.
 */
export interface SafeTxHashResult {
  /**
   * The EIP-712 domain hash.
   * This is the hash of the domain separator (chain ID + Safe address).
   */
  domainHash: Hex;

  /**
   * The message hash.
   * This is the hash of the encoded Safe transaction data.
   */
  messageHash: Hex;

  /**
   * The final Safe transaction hash.
   * This is what signers see on their hardware wallets.
   * Calculated as: keccak256(0x1901 + domainHash + messageHash)
   */
  safeTxHash: Hex;
}

/**
 * Calculate the Safe transaction hash using EIP-712 structured data signing.
 *
 * This is the core hash calculation that hardware wallets (like Ledger) display
 * to signers for verification. The hash is computed as:
 *
 * 1. Domain Hash: Hash of the EIP-712 domain (chain ID + Safe address)
 * 2. Message Hash: Hash of the encoded Safe transaction data
 * 3. Safe Tx Hash: keccak256(0x1901 + domainHash + messageHash)
 *
 * The calculation varies based on Safe version:
 * - Domain hash: v1.2.0 and older don't include chainId
 * - Message hash: v1.0.0+ uses `baseGas`, earlier versions use `dataGas`
 *
 * Reference: safe_hashes.sh lines 603-685
 *
 * @param chainId - The blockchain chain ID (e.g., 1 for Ethereum mainnet)
 * @param safeAddress - The Safe contract address
 * @param txData - The Safe transaction data
 * @param version - The Safe contract version (e.g., "1.3.0", "1.2.0+L2")
 * @returns Object containing domainHash, messageHash, and safeTxHash
 * @throws Error if version is invalid or unsupported
 *
 * @see https://eips.ethereum.org/EIPS/eip-712
 *
 * @example
 * const result = calculateSafeTxHash(
 *   1,
 *   "0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d",
 *   {
 *     to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *     value: "0",
 *     data: "0xa9059cbb...",
 *     operation: 0,
 *     safeTxGas: "0",
 *     baseGas: "0",
 *     gasPrice: "0",
 *     gasToken: "0x0000000000000000000000000000000000000000",
 *     refundReceiver: "0x0000000000000000000000000000000000000000",
 *     nonce: "520"
 *   },
 *   "1.3.0"
 * );
 *
 * console.log(result.safeTxHash); // The hash displayed on Ledger
 */
export function calculateSafeTxHash(
  chainId: number,
  safeAddress: Address,
  txData: SafeTransactionData,
  version: string
): SafeTxHashResult {
  // Validate the Safe version.
  // Reference: safe_hashes.sh lines 626-627
  validateVersion(version);

  // Calculate the domain hash.
  // Reference: safe_hashes.sh lines 631-632
  const domainHash = calculateDomainHash(chainId, safeAddress, version);

  // Calculate the message hash.
  // Reference: safe_hashes.sh lines 634-661
  const messageHash = calculateMessageHash(txData, version);

  // Calculate the Safe transaction hash using EIP-712 signature format.
  // EIP-712 signature: keccak256("\x19\x01" + domainHash + messageHash)
  // Reference: safe_hashes.sh lines 664-665
  // See: https://eips.ethereum.org/EIPS/eip-712#specification-of-the-eth_signtypeddata-json-rpc
  const safeTxHash = keccak256(
    concat([
      '0x1901' as Hex,  // EIP-712 magic prefix
      domainHash,
      messageHash,
    ])
  );

  return {
    domainHash,
    messageHash,
    safeTxHash,
  };
}

/**
 * Verify that a calculated Safe transaction hash matches the expected hash.
 *
 * @param calculated - The calculated Safe transaction hash
 * @param expected - The expected Safe transaction hash (from API or other source)
 * @returns True if hashes match (case-insensitive)
 *
 * @example
 * const result = calculateSafeTxHash(...);
 * const isValid = verifySafeTxHash(result.safeTxHash, apiResponse.safeTxHash);
 * if (!isValid) {
 *   console.error("Hash mismatch! Do not sign this transaction!");
 * }
 */
export function verifySafeTxHash(calculated: Hex, expected: Hex): boolean {
  return calculated.toLowerCase() === expected.toLowerCase();
}
