/**
 * Nested Safe (Safe-owned-by-Safe) approveHash transaction hashes.
 *
 * When an owner of a Safe is itself a Safe, that owner cannot produce an ECDSA
 * signature. It approves the parent's transaction on-chain instead, by executing
 * its own Safe transaction that calls `approveHash(bytes32)` on the parent.
 *
 * The nested Safe's signers therefore verify the hashes of THAT transaction, not
 * the parent's. This module builds the approveHash transaction and runs it
 * through the same EIP-712 calculator used for any other Safe transaction, so
 * version handling stays in one place.
 *
 * The computation is pure. It needs no network access.
 */

import { concat, isHex, type Address, type Hex } from 'viem';
import { Operation, type SafeTransactionData } from '../types.js';
import { ZERO_ADDRESS } from '../security/constants.js';
import { calculateSafeTxHash, type SafeTxHashResult } from './calculator.js';

/**
 * Selector of `approveHash(bytes32)` on the Safe singleton.
 *
 * Verified against `toFunctionSelector('approveHash(bytes32)')` in the tests.
 */
export const APPROVE_HASH_SELECTOR = '0xd4d9bdcd' as const;

/**
 * Inputs for a nested Safe's approveHash hash calculation.
 */
export interface NestedSafeHashInput {
  /** Chain ID both Safes live on. */
  chainId: number;

  /** The nested Safe: the owner Safe whose signers need these hashes. */
  nestedSafeAddress: Address;

  /**
   * The nested Safe's nonce for the approveHash transaction.
   *
   * This is the nested Safe's own nonce, not the parent's. It is not always the
   * nonce the API reports as current — a queued transaction on the nested Safe
   * moves the next free nonce forward.
   */
  nestedSafeNonce: bigint | string;

  /** The nested Safe's contract version (e.g. "1.4.1"). */
  nestedSafeVersion: string;

  /** The parent Safe: the call target of `approveHash`. */
  parentSafeAddress: Address;

  /**
   * The parent transaction's safeTxHash, as a 32-byte hex value.
   *
   * This must be the hash computed from the parent's transaction fields, never a
   * hash taken from an API response. It is the only thing the nested Safe's
   * signers approve, so a hash they did not derive themselves is not verifiable.
   */
  parentSafeTxHash: Hex;
}

/**
 * Result of a nested Safe's approveHash hash calculation.
 */
export interface NestedSafeHashResult extends SafeTxHashResult {
  /**
   * The full approveHash transaction the nested Safe executes. Present so a
   * caller can display the exact fields the hashes were derived from.
   */
  transaction: SafeTransactionData;
}

/**
 * Build the calldata for `approveHash(parentSafeTxHash)`.
 *
 * @param parentSafeTxHash - 32-byte parent transaction hash
 * @throws Error if the hash is not exactly 32 bytes of hex
 */
export function buildApproveHashCallData(parentSafeTxHash: Hex): Hex {
  if (!isHex(parentSafeTxHash) || parentSafeTxHash.length !== 66) {
    throw new Error(
      `approveHash requires a 32-byte hash. Received: ${parentSafeTxHash}`
    );
  }

  return concat([APPROVE_HASH_SELECTOR, parentSafeTxHash]);
}

/**
 * Build the Safe transaction a nested Safe executes to approve a parent
 * transaction.
 *
 * Every gas and refund field is zero and the operation is a plain CALL. Anything
 * else would change the hashes the nested Safe's signers see.
 */
export function buildApproveHashTransaction(
  input: Pick<
    NestedSafeHashInput,
    'parentSafeAddress' | 'parentSafeTxHash' | 'nestedSafeNonce'
  >
): SafeTransactionData {
  return {
    to: input.parentSafeAddress,
    value: '0',
    data: buildApproveHashCallData(input.parentSafeTxHash),
    operation: Operation.Call,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce: String(input.nestedSafeNonce),
  };
}

/**
 * Calculate the domain hash, message hash and safeTxHash a nested Safe's signers
 * see when approving a parent Safe transaction.
 *
 * @throws Error if the parent hash is malformed or the nested Safe version is
 *   invalid or unsupported
 *
 * @example
 * const nested = calculateNestedSafeTxHash({
 *   chainId: 1,
 *   nestedSafeAddress: '0xC3eA7C657884BB380B66D79C36aDCb5658b01896',
 *   nestedSafeNonce: '13',
 *   nestedSafeVersion: '1.4.1',
 *   parentSafeAddress: '0x1a37bF1Ccbf570C92FE2239FefaaAF861c2924DD',
 *   parentSafeTxHash: '0x7abc8c5239b0711daef70d9a06a37575632dc26f189b681759a9687ed3f747cc',
 * });
 */
export function calculateNestedSafeTxHash(
  input: NestedSafeHashInput
): NestedSafeHashResult {
  const transaction = buildApproveHashTransaction(input);

  const hashes = calculateSafeTxHash(
    input.chainId,
    input.nestedSafeAddress,
    transaction,
    input.nestedSafeVersion
  );

  return { ...hashes, transaction };
}
