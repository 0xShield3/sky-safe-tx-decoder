/**
 * Proxy implementation resolution.
 *
 * Many verified contracts are proxies: the verified ABI at the call target is
 * the proxy's (a handful of admin/upgrade functions), while the real functions
 * live on a separate implementation contract. To decode a call to a proxy we
 * must read its implementation address and decode against the implementation's
 * ABI instead.
 *
 * Two EIP-1967 layouts are handled:
 *
 * - Direct: the implementation address sits in the implementation slot. One
 *   `eth_getStorageAt` call resolves it.
 * - Beacon: the implementation slot is empty and the beacon slot holds a beacon
 *   contract, which is asked for the current implementation via `implementation()`.
 *   This costs one extra `eth_getStorageAt` and one `eth_call`.
 *
 * Resolution is bounded to a single hop in each case: an implementation is
 * never itself followed as a proxy, so a malicious or misconfigured chain of
 * contracts cannot cause unbounded RPC traffic or a resolution loop.
 *
 * It is used only by the Sourcify fallback, and the resulting decoding is still
 * re-encoded and byte-compared against the raw calldata — so a wrong or hostile
 * RPC response cannot present wrong VALUES as verified; at worst it yields no
 * decoding or a mismatch.
 */

import type { Address } from 'viem';
import { rpcCall } from './rpc.js';

/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1. */
const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

/** EIP-1967 beacon slot: keccak256("eip1967.proxy.beacon") - 1. */
const EIP1967_BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';

/** Selector for `implementation()`, the beacon interface required by EIP-1967. */
const IMPLEMENTATION_SELECTOR = '0x5c60da1b';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Extract a 20-byte address from a 32-byte storage word (right-aligned).
 * Returns null for the zero address (i.e. the slot is unset).
 */
export function addressFromStorageWord(word: string): Address | null {
  const hex = word.replace(/^0x/, '').padStart(64, '0');
  const address = ('0x' + hex.slice(24)).toLowerCase();
  return address === ZERO_ADDRESS ? null : (address as Address);
}

/**
 * Extract an address from the return data of an `implementation()` call.
 *
 * Stricter than {@link addressFromStorageWord}: an ABI-encoded `address` return
 * is exactly 32 bytes with 12 zero bytes of left padding, so anything else is
 * malformed and rejected rather than truncated into a plausible-looking
 * address. A beacon that returns junk must yield no implementation, not the
 * wrong one.
 *
 * Returns null for the zero address, wrong length, or non-zero padding.
 */
export function addressFromCallResult(result: string): Address | null {
  const hex = result.replace(/^0x/, '').toLowerCase();
  if (hex.length !== 64) return null;
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  // Upper 12 bytes must be zero padding for a well-formed `address` return.
  if (hex.slice(0, 24) !== '0'.repeat(24)) return null;
  const address = '0x' + hex.slice(24);
  return address === ZERO_ADDRESS ? null : (address as Address);
}

function getStorageAt(rpcUrl: string, address: string, slot: string, signal?: AbortSignal): Promise<string | null> {
  return rpcCall(rpcUrl, 'eth_getStorageAt', [address, slot, 'latest'], signal);
}

/** How a proxy's implementation address was reached. */
export interface ProxyResolution {
  /** The implementation contract whose ABI describes the call. */
  implementation: Address;
  /**
   * Set only for a beacon proxy: the beacon that reported the implementation.
   * Present so the provenance shown to a signer names every contract trusted
   * to produce the ABI, not just the last one.
   */
  beacon?: Address;
}

/**
 * Resolve an EIP-1967 proxy's implementation address.
 *
 * Tries the implementation slot first, then the beacon slot. A beacon proxy
 * holds no implementation address of its own: the beacon does, and is asked for
 * it with `implementation()`.
 *
 * @returns the resolution, or null if the target is not an EIP-1967 proxy of
 *          either kind, the slots are empty, the beacon does not answer, or the
 *          RPC is unavailable. Never throws — a fallback must fail closed.
 *
 * Resolution stops here: the returned implementation is not itself followed as
 * a proxy, so this makes at most three RPC calls and cannot loop.
 */
export async function resolveProxyImplementation(
  rpcUrl: string,
  address: string,
  signal?: AbortSignal
): Promise<ProxyResolution | null> {
  // 1. Direct EIP-1967 implementation slot — the common case.
  const implWord = await getStorageAt(rpcUrl, address, EIP1967_IMPLEMENTATION_SLOT, signal);
  const direct = implWord ? addressFromStorageWord(implWord) : null;
  if (direct) return { implementation: direct };

  // 2. Beacon proxy: the beacon slot names a contract that reports the
  //    implementation. Minimal beacon proxies (Solady, OpenZeppelin) keep the
  //    implementation slot empty, so this is the only way to reach their ABI.
  const beaconWord = await getStorageAt(rpcUrl, address, EIP1967_BEACON_SLOT, signal);
  const beacon = beaconWord ? addressFromStorageWord(beaconWord) : null;
  if (!beacon) return null;

  const returned = await rpcCall(
    rpcUrl,
    'eth_call',
    [{ to: beacon, data: IMPLEMENTATION_SELECTOR }, 'latest'],
    signal
  );
  const implementation = returned ? addressFromCallResult(returned) : null;
  if (!implementation) return null;

  return { implementation, beacon };
}
