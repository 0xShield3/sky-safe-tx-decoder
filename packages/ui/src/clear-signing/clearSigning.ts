/**
 * SPIKE — ERC-7730 clear-signing integration.
 *
 * Wraps @ethereum-sourcify/clear-signing to render the Ledger "clear signing"
 * view of a Safe transaction: the SafeTx EIP-712 envelope, and the calldata of
 * the call (and nested calls) where the ERC-7730 registry has a descriptor.
 *
 * STATUS: exploratory. NOT wired through this app's re-encode-and-compare gate.
 * The library decodes calldata itself from the registry descriptor + ABI; a
 * production integration must verify that decoding against the raw bytes the
 * way verifyDecodedData / the custom decoders do, before any of it is trusted
 * for signing. Everything this module produces is labelled a preview in the UI.
 *
 * Two ERC-7730 nuances this encodes:
 *  1. The registry Safe EIP-712 descriptor is keyed to the Safe SINGLETON
 *     (master copy) address, not the individual proxy. A real SafeTx's
 *     verifyingContract is the proxy, so a naive lookup misses. We look up by
 *     the singleton for the detected Safe version instead.
 *  2. The registry has no descriptors for the Sky contracts this app decodes
 *     itself (SPBEAM, the stewards, LockstakeEngine). So ERC-7730 and the
 *     custom decoders compose — 7730 for the Safe envelope and common
 *     contracts, custom decoders for the Sky-specific inner calls — rather
 *     than overlapping.
 */

import {
  format,
  formatTypedData,
  fetchPrebuiltRegistryIndex,
  type RegistryIndex,
  type TypedData,
} from '@ethereum-sourcify/clear-signing';

/** Safe master-copy (singleton) addresses per version, Ethereum mainnet. */
const SAFE_SINGLETON: Record<string, string> = {
  '1.3.0': '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
  '1.4.1': '0x41675C099F32341bf84BFc5382aF534df5C7461a',
  '1.5.0': '0xFf51A5898e281Db6DfC7855790607438dF2ca44b',
};

/** A displayed field from the ERC-7730 render. Shape mirrors the library. */
export interface ClearSignField {
  label: string;
  value?: unknown;
  format?: string;
  warning?: { code: string; message: string };
}

export interface ClearSignResult {
  intent?: string;
  interpolatedIntent?: string;
  fields: ClearSignField[];
  warnings?: Array<{ code: string; message: string }>;
}

// Load the prebuilt registry index once and share it across calls.
let indexPromise: Promise<RegistryIndex> | null = null;
function registryIndex() {
  if (!indexPromise) indexPromise = fetchPrebuiltRegistryIndex();
  return indexPromise;
}

/**
 * Clear-sign a single call's calldata via the ERC-7730 registry.
 * Returns null when no descriptor exists for the contract (the common case for
 * Sky contracts — those are handled by the custom decoders).
 */
export async function clearSignCalldata(chainId: number, to: string, data: string): Promise<ClearSignResult | null> {
  try {
    const index = await registryIndex();
    const result = await format({ chainId, to, data }, { descriptorResolverOptions: { type: 'github', index } });
    // A result whose only content is a NO_DESCRIPTOR warning is "not covered".
    if (!result?.intent && !result?.fields?.length) return null;
    return result as ClearSignResult;
  } catch {
    return null;
  }
}

/**
 * Clear-sign the SafeTx EIP-712 envelope — the human-readable view a Ledger
 * shows for the Safe transaction itself. Looked up by the version's singleton.
 * Returns null when the Safe version has no known singleton mapping.
 */
export async function clearSignSafeTx(
  chainId: number,
  safeVersion: string,
  tx: {
    to: string;
    value: string;
    data: string;
    operation: number;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
    nonce: string;
  }
): Promise<ClearSignResult | null> {
  const singleton = SAFE_SINGLETON[safeVersion];
  if (!singleton) return null;

  const typedData = {
    domain: { chainId, verifyingContract: singleton },
    primaryType: 'SafeTx',
    types: {
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    message: { ...tx },
  } as unknown as TypedData;

  try {
    const index = await registryIndex();
    const result = await formatTypedData(typedData, {
      descriptorResolverOptions: { type: 'github', index },
    });
    if (!result?.intent && !result?.fields?.length) return null;
    return result as ClearSignResult;
  } catch {
    return null;
  }
}
