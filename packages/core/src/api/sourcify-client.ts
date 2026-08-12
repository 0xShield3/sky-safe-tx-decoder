/**
 * Sourcify ABI fetch.
 *
 * Sourcify serves the ABI of the source that has been verified against a
 * contract's on-chain bytecode. This is a materially stronger trust model than
 * a selector database: it is not "someone submitted a signature for these four
 * bytes", it is "this is the ABI of the exact contract deployed at this
 * address, tied to its bytecode". A partial (`match`) result still means the
 * bytecode matches, so the ABI genuinely describes the contract; only source
 * metadata such as comments may differ.
 *
 * This is used ONLY as an explicit, opt-in fallback when the Safe Transaction
 * Service returns no decoded data. Whatever it returns is still re-encoded and
 * byte-compared against the raw calldata before anything is shown as decoded.
 *
 * Be precise about what that proves: the check pins the BYTES, not their
 * interpretation. It proves the decoded call re-encodes to exactly the calldata
 * being signed, selector included. It does not prove the ABI describes what the
 * contract does. A hostile ABI can still change parameter names freely, and can
 * change the function name and the argument types at the cost of a 4-byte
 * selector collision (~2^32 hashes, cheap). Where the head encoding layout is
 * unchanged, that last case alters the rendered value itself — declaring int256
 * where the contract has uint256 renders 0xffff…ff9c as -100 rather than a
 * number close to 2^256, with `verified` still true.
 *
 * So this raises the bar; it is not a proof of meaning. It is why the fallback
 * is opt-in, why its provenance is labelled in the UI, and why a decoding is
 * never a substitute for knowing what the contract does.
 *
 * @see https://docs.sourcify.dev/docs/api/
 */

import type { Abi } from 'viem';

const SOURCIFY_API = 'https://sourcify.dev/server';

/** Human-readable Sourcify page for a verified contract, per chain. */
const SOURCIFY_REPO = 'https://repo.sourcify.dev';

/**
 * URL of the Sourcify page showing a contract's verified sources.
 *
 * Given to a signer so the ABI used for a decoding can be inspected at its
 * source rather than taken on trust. Chain-specific: an address not verified on
 * that chain 404s rather than resolving to a same-address contract elsewhere.
 */
export function getSourcifyContractUrl(chainId: number, address: string): string {
  return `${SOURCIFY_REPO}/${chainId}/${address}`;
}

/**
 * Ask Sourcify to import a contract's verified source from a block explorer
 * (Etherscan and friends) and verify it. Many contracts are verified on
 * Etherscan but not mirrored to Sourcify; this triggers Sourcify to fetch and
 * verify from Etherscan on its own — no Etherscan API key is needed on this
 * side, and the verification is still bytecode-checked by Sourcify.
 *
 * Returns true when Sourcify accepted the request (verification runs
 * asynchronously — poll {@link fetchAbiFromSourcify} afterwards). Never throws.
 */
export async function requestEtherscanImport(chainId: number, address: string, signal?: AbortSignal): Promise<boolean> {
  const endpoint = `${SOURCIFY_API}/v2/verify/etherscan/${chainId}/${address}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal,
    });
    // 200/202 with a verificationId means accepted; a 409 "already verified"
    // is also fine — either way the ABI will be fetchable.
    if (response.ok) return true;
    if (response.status === 409) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetch the verified ABI for a contract from Sourcify.
 *
 * @param chainId - EVM chain id (1 for Ethereum mainnet)
 * @param address - contract address
 * @param signal  - optional AbortSignal to cancel the request
 * @returns the ABI, or null if the contract is not verified, has no ABI, or
 *          the request fails. Never throws — a fallback must fail closed.
 */
export async function fetchAbiFromSourcify(
  chainId: number,
  address: string,
  signal?: AbortSignal
): Promise<Abi | null> {
  // Request the match state alongside the ABI so the "verified against on-chain
  // bytecode" property is enforced here, not assumed. Sourcify exposes the
  // bytecode match as runtimeMatch/creationMatch ("exact_match" | "match" |
  // null); an unverified contract 404s.
  const endpoint = `${SOURCIFY_API}/v2/contract/${chainId}/${address}?fields=abi,runtimeMatch,creationMatch`;

  try {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) {
      // 404 = not verified on Sourcify. Any other non-2xx = treat as absent.
      return null;
    }

    const body = (await response.json()) as {
      abi?: unknown;
      runtimeMatch?: string | null;
      creationMatch?: string | null;
    };

    // Require a bytecode match. Accept an exact or partial match on either the
    // runtime or creation bytecode; reject anything else. A partial ("match")
    // still means the deployed bytecode matches, so the ABI describes this
    // contract — only source metadata such as comments may differ.
    const isMatch = (m: string | null | undefined) => m === 'exact_match' || m === 'match';
    if (!isMatch(body.runtimeMatch) && !isMatch(body.creationMatch)) {
      return null;
    }

    if (!body.abi || !Array.isArray(body.abi) || body.abi.length === 0) {
      return null;
    }

    return body.abi as Abi;
  } catch {
    // Network failure, abort, or malformed JSON. Fail closed.
    return null;
  }
}
