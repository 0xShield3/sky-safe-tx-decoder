/**
 * Decode calldata against an ABI fetched from Sourcify, and prove the decoding
 * describes the exact bytes being signed.
 *
 * The proof is the same one used everywhere else in this tool: re-encode the
 * decoded call with the same ABI and byte-compare it to the raw calldata. viem
 * ignores bytes appended past the end of the encoded arguments, so the compare
 * — not the decode — is what rejects trailing-calldata tampering. Nothing here
 * is ever presented as decoded unless `verified` is true.
 */

import type { Abi, AbiFunction, Address, Hex } from 'viem';
import { decodeFunctionData, encodeFunctionData, toFunctionSelector, toFunctionSignature } from 'viem';
import { fetchAbiFromSourcify, requestEtherscanImport } from '../api/sourcify-client.js';
import { resolveProxyImplementation } from '../api/proxy.js';

const IMPORT_POLL_ATTEMPTS = 6;
const IMPORT_POLL_INTERVAL_MS = 1500;

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

/**
 * Get a contract's ABI from Sourcify, importing it from a block explorer first
 * if Sourcify does not already have it.
 *
 * Many contracts (and proxy implementations) are verified on Etherscan but not
 * mirrored to Sourcify. On a miss this asks Sourcify to import from Etherscan,
 * then polls briefly for the result. No Etherscan key is needed here, and the
 * decoded call is still re-encode-verified downstream.
 */
async function getAbiImporting(chainId: number, address: string, signal?: AbortSignal): Promise<Abi | null> {
  const existing = await fetchAbiFromSourcify(chainId, address, signal);
  if (existing) return existing;

  const requested = await requestEtherscanImport(chainId, address, signal);
  if (!requested) return null;

  for (let i = 0; i < IMPORT_POLL_ATTEMPTS; i++) {
    try {
      await delay(IMPORT_POLL_INTERVAL_MS, signal);
    } catch {
      return null; // aborted
    }
    const abi = await fetchAbiFromSourcify(chainId, address, signal);
    if (abi) return abi;
  }
  return null;
}

export interface SourcifyDecodedParam {
  name: string;
  type: string;
  /** Display value; arrays/tuples are kept structured for the renderer. */
  value: unknown;
}

export interface SourcifyDecodeResult {
  method: string;
  /** Canonical signature, e.g. `withdrawV3(address,address,uint256)`. */
  signature: string;
  parameters: SourcifyDecodedParam[];
  /** True only when the decoded call re-encodes to the raw calldata exactly. */
  verified: boolean;
  /** The re-encoded bytes, for display when they do NOT match. */
  reencoded: Hex;
  /**
   * Set when the call target is a proxy and this decoding came from the
   * implementation's ABI. Holds the implementation address, for provenance.
   */
  implementation?: Address;
  /**
   * Set only when the implementation was reached through an EIP-1967 beacon.
   * Holds the beacon address, so the provenance names every contract trusted
   * to produce this ABI.
   */
  beacon?: Address;
}

/**
 * Decode `data` against `abi` and verify by re-encoding.
 *
 * @returns the decoded result, or null if the ABI does not decode these bytes
 *          at all (no matching function / selector). A result with
 *          `verified: false` means the ABI matched a function but the bytes did
 *          not round-trip — the caller must treat that as a hard warning, never
 *          as a decoding.
 */
export function decodeWithAbi(abi: Abi, data: Hex): SourcifyDecodeResult | null {
  let functionName: string;
  let args: readonly unknown[];
  try {
    const decoded = decodeFunctionData({ abi, data });
    functionName = decoded.functionName;
    args = (decoded.args ?? []) as readonly unknown[];
  } catch {
    // Selector not in this ABI, or undecodable against it.
    return null;
  }

  // Locate the specific function entry so parameter names/types come from the
  // ABI, and so re-encoding uses exactly this overload.
  const fn = findFunction(abi, functionName, data.slice(0, 10) as Hex);
  if (!fn) return null;

  let reencoded: Hex;
  try {
    reencoded = encodeFunctionData({ abi, functionName: functionName as never, args: args as never });
  } catch {
    // If the decoded args cannot be re-encoded, we cannot prove anything.
    // Report unverified rather than inventing a passing result.
    reencoded = '0x';
  }

  const parameters: SourcifyDecodedParam[] = (fn.inputs ?? []).map((input, i) => ({
    name: input.name || `arg${i}`,
    type: input.type,
    value: args[i],
  }));

  return {
    method: functionName,
    signature: toFunctionSignature(fn),
    parameters,
    verified: reencoded !== '0x' && reencoded.toLowerCase() === data.toLowerCase(),
    reencoded,
  };
}

/**
 * Find the ABI function that owns `selector`. Falls back to name match when a
 * selector cannot be computed, but selector match is preferred so overloaded
 * names resolve to the right entry.
 */
function findFunction(abi: Abi, name: string, selector: Hex): AbiFunction | undefined {
  const candidates = abi.filter((item): item is AbiFunction => item.type === 'function' && item.name === name);
  if (candidates.length <= 1) return candidates[0];

  for (const candidate of candidates) {
    try {
      if (toFunctionSelector(candidate).toLowerCase() === selector.toLowerCase()) {
        return candidate;
      }
    } catch {
      // ignore and continue
    }
  }
  return candidates[0];
}

/**
 * Fetch a verified ABI from Sourcify and decode a call with it, following an
 * EIP-1967 proxy to its implementation when the call target's own ABI does not
 * contain the selector.
 *
 * This is the full Sourcify fallback: most verified DeFi contracts (Aave,
 * Compound, many others) are proxies whose own ABI is just a handful of
 * admin/upgrade functions, so decoding a call to the proxy requires the
 * implementation's ABI. Both EIP-1967 layouts are followed — the implementation
 * slot, and a beacon whose `implementation()` names the current one — via
 * `rpcUrl`; if that is omitted, only the direct ABI is tried.
 *
 * The result is always re-encode-verified in `decodeWithAbi`, so following the
 * proxy does not weaken the guarantee that the displayed VALUES are the signed
 * bytes.
 *
 * @returns the decoded result (with `implementation` set when it came from the
 *          proxy's implementation), or null when nothing on Sourcify decodes
 *          the call.
 */
export async function decodeViaSourcify(opts: {
  chainId: number;
  to: string;
  data: Hex;
  rpcUrl?: string;
  signal?: AbortSignal;
}): Promise<SourcifyDecodeResult | null> {
  const { chainId, to, data, rpcUrl, signal } = opts;

  // 1. Direct: the call target's own verified ABI (importing from Etherscan if
  //    Sourcify does not already have it).
  const directAbi = await getAbiImporting(chainId, to, signal);
  if (directAbi) {
    const direct = decodeWithAbi(directAbi, data);
    // A non-null result means the selector matched this ABI — use it (even a
    // re-encode mismatch, which is a real warning, belongs to this contract).
    if (direct) return direct;
  }

  // 2. Proxy: follow the EIP-1967 implementation — directly, or through a
  //    beacon — and decode against its ABI.
  if (rpcUrl) {
    const proxy = await resolveProxyImplementation(rpcUrl, to, signal);
    if (proxy) {
      const implAbi = await getAbiImporting(chainId, proxy.implementation, signal);
      if (implAbi) {
        const viaImpl = decodeWithAbi(implAbi, data);
        if (viaImpl) {
          return proxy.beacon
            ? { ...viaImpl, implementation: proxy.implementation, beacon: proxy.beacon }
            : { ...viaImpl, implementation: proxy.implementation };
        }
      }
    }
  }

  return null;
}
