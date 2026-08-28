/**
 * Safe state read directly from a node.
 *
 * The Safe Transaction Service rate-limits, so every read here prefers an
 * `eth_call` against the Safe itself. The service remains the fallback.
 *
 * The values read are a Safe's owners, its nonce, and its version. None is
 * presented as verified on the node's word: the owners only populate a
 * suggestion list, and the nonce and version reach the signer as fields they
 * see and can override.
 *
 * Every function fails closed. A node that is unreachable, hostile, or answers
 * with junk yields null or an empty list, never a throw and never a wrong value
 * dressed as a right one.
 */

import { decodeAbiParameters, type Address, type Hex } from 'viem';
import { toChecksumAddress } from '../utils/address.js';
import { rpcBatch, rpcCall } from './rpc.js';

/** Selector of `getOwners()`. Verified against viem's derivation in the tests. */
export const GET_OWNERS_SELECTOR = '0xa0e67e2b' as const;

/** Selector of `VERSION()`. Verified against viem's derivation in the tests. */
export const VERSION_SELECTOR = '0xffa1ad74' as const;

/** Selector of `nonce()`. Verified against viem's derivation in the tests. */
export const NONCE_SELECTOR = '0xaffed0e0' as const;

/**
 * A Safe version must look like a dotted numeric version.
 *
 * `VERSION()` is not unique to Safe, so a contract with a permissive fallback
 * can answer with any string. Requiring the shape of a version keeps arbitrary
 * return data from being read as a Safe, and keeps a nonsense string out of the
 * hash calculation.
 */
const VERSION_SHAPE = /^\d+\.\d+\.\d+/;

/** An owner of a Safe that is itself a Safe. */
export interface NestedSafeOwner {
  /** Checksummed owner address. */
  address: Address;
  /** Version as `VERSION()` reported it. */
  version: string;
}

function decodeString(result: string | null): string | null {
  if (!result || result === '0x') return null;
  try {
    const [value] = decodeAbiParameters([{ type: 'string' }], result as Hex);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function decodeVersion(result: string | null): string | null {
  const value = decodeString(result);
  return value && VERSION_SHAPE.test(value) ? value : null;
}

/**
 * Read a Safe's owner list with one `eth_call` to `getOwners()`.
 *
 * @returns checksummed owner addresses, or null if the call fails or the return
 *          data is not a well-formed `address[]`.
 */
export async function fetchSafeOwners(
  rpcUrl: string,
  safeAddress: string,
  signal?: AbortSignal
): Promise<Address[] | null> {
  const result = await rpcCall(rpcUrl, 'eth_call', [{ to: safeAddress, data: GET_OWNERS_SELECTOR }, 'latest'], signal);
  if (!result || result === '0x') return null;

  try {
    const [owners] = decodeAbiParameters([{ type: 'address[]' }], result as Hex);
    if (!Array.isArray(owners)) return null;
    // Re-checksum rather than trusting the node's casing.
    return owners
      .map((owner) => toChecksumAddress(owner as string))
      .filter((owner): owner is Address => owner !== null);
  } catch {
    return null;
  }
}

/**
 * Read a Safe's version with one `eth_call` to `VERSION()`.
 *
 * @returns the version, or null if the address is not a Safe, the call fails, or
 *          the answer is not shaped like a version.
 */
export async function fetchSafeVersionOnchain(
  rpcUrl: string,
  safeAddress: string,
  signal?: AbortSignal
): Promise<string | null> {
  const result = await rpcCall(rpcUrl, 'eth_call', [{ to: safeAddress, data: VERSION_SELECTOR }, 'latest'], signal);
  return decodeVersion(result);
}

/**
 * Read a Safe's current nonce with one `eth_call` to `nonce()`.
 *
 * @returns the nonce as a decimal string, or null on any failure.
 */
export async function fetchSafeNonceOnchain(
  rpcUrl: string,
  safeAddress: string,
  signal?: AbortSignal
): Promise<string | null> {
  const result = await rpcCall(rpcUrl, 'eth_call', [{ to: safeAddress, data: NONCE_SELECTOR }, 'latest'], signal);
  if (!result || result === '0x') return null;

  try {
    const [nonce] = decodeAbiParameters([{ type: 'uint256' }], result as Hex);
    return typeof nonce === 'bigint' ? nonce.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Find the owners of a Safe that are themselves Safes.
 *
 * Costs two HTTP requests regardless of owner count: one `getOwners()` call,
 * then one batched request carrying a `VERSION()` probe per owner. An externally
 * owned account returns empty data for that probe and a non-Safe contract
 * reverts, so neither is reported.
 *
 * @returns detected owner Safes with their versions, in owner order. Empty when
 *          the node is unreachable or no owner is a Safe — the caller treats
 *          both the same way, because this only produces suggestions.
 */
export async function detectNestedSafeOwners(
  rpcUrl: string,
  parentSafeAddress: string,
  signal?: AbortSignal
): Promise<NestedSafeOwner[]> {
  const owners = await fetchSafeOwners(rpcUrl, parentSafeAddress, signal);
  if (!owners || owners.length === 0) return [];

  const results = await rpcBatch(
    rpcUrl,
    owners.map((owner) => ({
      method: 'eth_call',
      params: [{ to: owner, data: VERSION_SELECTOR }, 'latest'],
    })),
    signal
  );

  const detected: NestedSafeOwner[] = [];
  for (let index = 0; index < owners.length; index++) {
    const version = decodeVersion(results[index] ?? null);
    if (version) detected.push({ address: owners[index]!, version });
  }
  return detected;
}
