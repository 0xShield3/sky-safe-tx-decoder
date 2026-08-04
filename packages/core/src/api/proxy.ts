/**
 * Proxy implementation resolution.
 *
 * Many verified contracts are proxies: the verified ABI at the call target is
 * the proxy's (a handful of admin/upgrade functions), while the real functions
 * live on a separate implementation contract. To decode a call to a proxy we
 * must read its implementation address and decode against the implementation's
 * ABI instead.
 *
 * This reads the standard EIP-1967 implementation storage slot via a single
 * `eth_getStorageAt` RPC call. It is used only by the Sourcify fallback, and
 * the resulting decoding is still re-encoded and byte-compared against the raw
 * calldata — so a wrong or hostile RPC response cannot present wrong VALUES as
 * verified; at worst it yields no decoding or a mismatch.
 */

import type { Address } from 'viem';

/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1. */
const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

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

async function getStorageAt(
  rpcUrl: string,
  address: string,
  slot: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getStorageAt',
        params: [address, slot, 'latest'],
      }),
      signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { result?: unknown };
    return typeof json.result === 'string' ? json.result : null;
  } catch {
    // Network failure, abort, or malformed response. Fail closed.
    return null;
  }
}

/**
 * Resolve an EIP-1967 proxy's implementation address.
 *
 * @returns the implementation address, or null if the target is not an
 *          EIP-1967 proxy, the slot is empty, or the RPC is unavailable. Never
 *          throws — a fallback must fail closed.
 *
 * Only the EIP-1967 implementation slot is read. Beacon proxies store a beacon
 * address in a different slot and need a further `implementation()` call to
 * resolve; that is not handled here and returns null.
 */
export async function resolveProxyImplementation(
  rpcUrl: string,
  address: string,
  signal?: AbortSignal
): Promise<Address | null> {
  const word = await getStorageAt(rpcUrl, address, EIP1967_IMPLEMENTATION_SLOT, signal);
  return word ? addressFromStorageWord(word) : null;
}
