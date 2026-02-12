/**
 * Safe Transaction Message Hash Calculation
 *
 * Reference: safe_hashes.sh lines 634-661
 */

import { encodeAbiParameters, keccak256, type Hex } from 'viem';
import { SAFE_TX_TYPEHASH, SAFE_TX_TYPEHASH_OLD } from './constants.js';
import { getVersion, isVersionLt } from './version.js';
import type { SafeTransactionData } from '../types.js';

/**
 * Calculate the message hash for a Safe transaction.
 *
 * Safe multisig versions < 1.0.0 use a legacy type hash where the parameter
 * `baseGas` was called `dataGas`. Starting with version 1.0.0, `baseGas` was introduced.
 *
 * The dynamic `bytes` type (transaction data) is encoded as a keccak256 hash of its content,
 * per EIP-712 specification.
 *
 * Reference: safe_hashes.sh lines 634-661
 *
 * @param txData - Safe transaction data
 * @param version - Safe version (e.g., "1.3.0", "0.9.0")
 * @returns The keccak256 hash of the encoded message
 *
 * @see https://github.com/safe-global/safe-smart-account/pull/90
 * @see https://eips.ethereum.org/EIPS/eip-712#definition-of-encodedata
 *
 * @example
 * calculateMessageHash({
 *   to: "0x...",
 *   value: "0",
 *   data: "0x...",
 *   operation: 0,
 *   safeTxGas: "0",
 *   baseGas: "0",
 *   gasPrice: "0",
 *   gasToken: "0x0000000000000000000000000000000000000000",
 *   refundReceiver: "0x0000000000000000000000000000000000000000",
 *   nonce: "520"
 * }, "1.3.0")
 */
export function calculateMessageHash(
  txData: SafeTransactionData,
  version: string
): Hex {
  const cleanVersion = getVersion(version);

  // Calculate the data hash.
  // The dynamic value `bytes` is encoded as a `keccak256` hash of its content.
  // Reference: safe_hashes.sh lines 634-637
  // See: https://eips.ethereum.org/EIPS/eip-712#definition-of-encodedata
  const dataHash = keccak256(txData.data as Hex);

  // Safe multisig versions < 1.0.0 use a legacy (i.e. the parameter value `baseGas` was
  // called `dataGas` previously) `SAFE_TX_TYPEHASH` value. Starting with version 1.0.0,
  // `baseGas` was introduced.
  // Reference: safe_hashes.sh lines 639-644
  // See: https://github.com/safe-global/safe-smart-account/pull/90
  const safeTxTypeHash = isVersionLt(cleanVersion, '1.0.0')
    ? SAFE_TX_TYPEHASH_OLD
    : SAFE_TX_TYPEHASH;

  // Encode the SafeTx struct.
  // Reference: safe_hashes.sh lines 646-658
  // Note: The bash script uses `cast abi-encode` with the full struct signature,
  // but viem's `encodeAbiParameters` achieves the same result.
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' }, // typeHash
      { type: 'address' }, // to
      { type: 'uint256' }, // value
      { type: 'bytes32' }, // keccak256(data)
      { type: 'uint8' },   // operation
      { type: 'uint256' }, // safeTxGas
      { type: 'uint256' }, // baseGas (or dataGas for old versions)
      { type: 'uint256' }, // gasPrice
      { type: 'address' }, // gasToken
      { type: 'address' }, // refundReceiver
      { type: 'uint256' }, // nonce
    ],
    [
      safeTxTypeHash,
      txData.to,
      BigInt(txData.value),
      dataHash,
      txData.operation,
      BigInt(txData.safeTxGas),
      BigInt(txData.baseGas),
      BigInt(txData.gasPrice),
      txData.gasToken,
      txData.refundReceiver,
      BigInt(txData.nonce),
    ]
  );

  // Calculate the message hash.
  // Reference: safe_hashes.sh line 661
  return keccak256(encoded);
}
