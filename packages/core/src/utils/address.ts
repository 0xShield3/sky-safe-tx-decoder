/**
 * Address normalisation.
 */

import { getAddress, type Address } from 'viem';

const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Return the EIP-55 checksummed form of an address, or null if the input is not
 * a 20-byte hex address.
 *
 * Unlike viem's `getAddress`, this never throws on a casing/checksum mismatch:
 * it lower-cases first, so any valid-hex input — lower-case, upper-case, or
 * mis-checksummed — is canonicalised to the correct checksum. Use this to
 * normalise a user-pasted Safe address before it reaches the Safe Transaction
 * Service, which requires the address in its URL to be checksummed and rejects
 * anything else with HTTP 422 (surfacing as "failed to load").
 */
export function toChecksumAddress(address: string): Address | null {
  const trimmed = address.trim();
  if (!ADDRESS_HEX.test(trimmed)) return null;
  return getAddress(trimmed.toLowerCase());
}
