/**
 * EIP-712 Domain Hash Calculation
 *
 * Reference: safe_hashes.sh lines 579-601
 */

import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import { DOMAIN_SEPARATOR_TYPEHASH, DOMAIN_SEPARATOR_TYPEHASH_OLD } from './constants.js';
import { getVersion, isVersionLte } from './version.js';

/**
 * Calculate the EIP-712 domain hash for a Safe multisig.
 *
 * Safe multisig versions <= 1.2.0 use a legacy domain separator without chainId.
 * Starting with version 1.3.0, the chainId field was introduced.
 *
 * Reference: safe_hashes.sh lines 579-601
 *
 * @param chainId - The chain ID (only used for versions >= 1.3.0)
 * @param safeAddress - The Safe contract address
 * @param version - The Safe version (e.g., "1.3.0", "1.2.0+L2")
 * @returns The keccak256 hash of the encoded domain separator
 *
 * @see https://github.com/safe-global/safe-smart-account/pull/264
 *
 * @example
 * // For Safe v1.3.0+ (with chainId)
 * calculateDomainHash(1, "0x...", "1.3.0")
 *
 * // For Safe v1.2.0 and older (without chainId)
 * calculateDomainHash(1, "0x...", "1.2.0")
 */
export function calculateDomainHash(
  chainId: number,
  safeAddress: Address,
  version: string
): Hex {
  const cleanVersion = getVersion(version);

  // Safe multisig versions <= 1.2.0 use a legacy (i.e. without `chainId`) `DOMAIN_SEPARATOR_TYPEHASH` value.
  // Starting with version 1.3.0, the `chainId` field was introduced.
  // Reference: safe_hashes.sh lines 590-595
  // See: https://github.com/safe-global/safe-smart-account/pull/264
  if (isVersionLte(cleanVersion, '1.2.0')) {
    // Legacy encoding (without chainId): keccak256(abi.encode(typeHash, address))
    const encoded = encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }],
      [DOMAIN_SEPARATOR_TYPEHASH_OLD, safeAddress]
    );
    return keccak256(encoded);
  }

  // Current encoding (with chainId): keccak256(abi.encode(typeHash, chainId, address))
  const encoded = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
    [DOMAIN_SEPARATOR_TYPEHASH, BigInt(chainId), safeAddress]
  );
  return keccak256(encoded);
}
