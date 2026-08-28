/**
 * Nested Safe hashes — the hashes an owner Safe's own signers verify.
 *
 * An owner that is itself a Safe cannot sign. It approves by executing its own
 * Safe transaction calling `approveHash(bytes32)` on the parent, so its signers
 * see the hashes of that transaction instead of the parent's.
 *
 * Reads prefer the public RPC over the Safe Transaction Service, which
 * rate-limits. Opening the section costs two RPC requests: the parent's
 * `getOwners()`, then one batch of `VERSION()` probes that finds which owners
 * are Safes. Selecting or typing an address costs one more batch, for that
 * Safe's `nonce()` and `VERSION()`. The Safe API is used only where the RPC
 * gave no answer.
 *
 * Nothing here is fetched until the section is opened.
 *
 * The nonce stays editable because a queued approveHash moves the next free
 * nonce past the current one. The version does not: it is a property of the
 * deployed contract, so it is shown as read. A manual version field appears
 * only when neither source produced one, so the calculation stays possible.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  SafeApiClient,
  calculateNestedSafeTxHash,
  detectNestedSafeOwners,
  fetchSafeStateOnchain,
  getNetwork,
  toChecksumAddress,
  type NestedSafeHashResult,
  type NestedSafeOwner,
} from '@shield3/sky-safe-core';
import { HashHex } from './HashHex';

interface NestedSafeHashesProps {
  network: string;
  chainId: number;
  parentSafeAddress: string;
  /**
   * The parent safeTxHash THIS app computed from the transaction fields, or null
   * when it does not match the one the Safe API reported. Never the API's hash:
   * a nested signer approves a bytes32 and nothing else, so a hash the app could
   * not derive itself is not something to hand a signer.
   */
  computedParentSafeTxHash: string | null;
  uppercase: boolean;
}

/**
 * Width cap for the address field: enough for a whole 42-character address in
 * the monospace face plus the input's own padding, and no wider. A pasted
 * address must never scroll or clip inside it.
 */
const ADDRESS_FIELD_WIDTH = 'sm:max-w-[48ch]';

function rpcUrlFor(network: string): string | undefined {
  try {
    return getNetwork(network).rpcUrl;
  } catch {
    return undefined;
  }
}

function HashBlock({ label, value, uppercase }: { label: string; value: string; uppercase: boolean }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">{label}</p>
      <div className="bg-gray-900 p-3 rounded-lg">
        <HashHex value={value} uppercase={uppercase} className="text-sm" />
      </div>
    </div>
  );
}

export function NestedSafeHashes({
  network,
  chainId,
  parentSafeAddress,
  computedParentSafeTxHash,
  uppercase,
}: NestedSafeHashesProps) {
  const [open, setOpen] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [nonce, setNonce] = useState('');
  /** Version as read from the chain or the service. Not editable while set. */
  const [version, setVersion] = useState<string | null>(null);
  /** Manual version, used only when neither source answered. */
  const [versionInput, setVersionInput] = useState('');
  const [loading, setLoading] = useState(false);
  /** True once a lookup for the current address has finished. */
  const [looked, setLooked] = useState(false);
  const [owners, setOwners] = useState<NestedSafeOwner[]>([]);

  const rpcUrl = rpcUrlFor(network);
  const nestedAddress = toChecksumAddress(addressInput);
  const addressError = addressInput.trim() !== '' && !nestedAddress ? 'Not a 20-byte hex address.' : null;

  // Which owners of the parent are themselves Safes. Suggestions only, so a
  // node that does not answer simply produces none.
  useEffect(() => {
    if (!open || !rpcUrl) return;

    const controller = new AbortController();
    detectNestedSafeOwners(rpcUrl, parentSafeAddress, controller.signal)
      .then((detected) => {
        if (!controller.signal.aborted) setOwners(detected);
      })
      .catch(() => {
        /* Suggestions are an enhancement. Silence is the correct failure. */
      });

    return () => controller.abort();
  }, [open, rpcUrl, parentSafeAddress]);

  // Nonce and version for the entered Safe: RPC first, Safe API only where the
  // RPC gave nothing.
  useEffect(() => {
    if (!open || !nestedAddress) {
      setVersion(null);
      setLooked(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setLooked(false);

    (async () => {
      let nextNonce: string | null = null;
      let nextVersion: string | null = null;

      if (rpcUrl) {
        const state = await fetchSafeStateOnchain(rpcUrl, nestedAddress, controller.signal);
        nextNonce = state.nonce;
        nextVersion = state.version;
      }

      if (nextNonce === null || nextVersion === null) {
        try {
          const info = await new SafeApiClient(network).fetchSafeInfo(nestedAddress);
          if (nextNonce === null) nextNonce = String(info.nonce);
          if (nextVersion === null && info.version) nextVersion = info.version;
        } catch {
          /* Both sources may fail. The manual fields below still work. */
        }
      }

      if (cancelled) return;
      setVersion(nextVersion);
      if (nextNonce !== null) setNonce(nextNonce);
      setLoading(false);
      setLooked(true);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, nestedAddress, rpcUrl, network]);

  const effectiveVersion = version ?? versionInput.trim();
  const nonceError = nonce.trim() !== '' && !/^\d+$/.test(nonce.trim()) ? 'Nonce must be a whole number.' : null;

  const computed = useMemo((): { result: NestedSafeHashResult } | { error: string } | null => {
    if (!computedParentSafeTxHash) return null;
    if (!nestedAddress || nonceError || nonce.trim() === '' || effectiveVersion === '') return null;

    try {
      return {
        result: calculateNestedSafeTxHash({
          chainId,
          nestedSafeAddress: nestedAddress,
          nestedSafeNonce: nonce.trim(),
          nestedSafeVersion: effectiveVersion,
          parentSafeAddress: parentSafeAddress as `0x${string}`,
          parentSafeTxHash: computedParentSafeTxHash as `0x${string}`,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [chainId, nestedAddress, nonce, nonceError, effectiveVersion, parentSafeAddress, computedParentSafeTxHash]);

  return (
    <details className="border border-gray-200 rounded-lg" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
        Nested Safe hashes
      </summary>

      <div className="px-4 pb-4 pt-1 space-y-4">
        {!computedParentSafeTxHash ? (
          <p className="text-sm text-red-800">
            Unavailable while the computed safeTxHash does not match the Safe API.
          </p>
        ) : (
          <>
            {owners.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Owner Safes</p>
                <ul className="space-y-1">
                  {owners.map((owner) => (
                    <li key={owner.address}>
                      <button
                        type="button"
                        onClick={() => setAddressInput(owner.address)}
                        className={`w-full text-left font-mono text-sm px-2 py-1 rounded break-all hover:bg-blue-50 ${
                          nestedAddress === owner.address ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
                        }`}
                      >
                        {/* The address gets its own line so a copy or a text
                            dump can never run it into the label beside it. */}
                        <span className="block break-all">{owner.address}</span>
                        <span className="block font-sans text-xs text-gray-500">Safe version {owner.version}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label htmlFor="nested-safe-address" className="block text-sm font-semibold text-gray-700 mb-1">
                Nested Safe address
              </label>
              <input
                id="nested-safe-address"
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="0x0000000000000000000000000000000000000000"
                className={`w-full ${ADDRESS_FIELD_WIDTH} font-mono text-sm px-3 py-2 border border-gray-300 rounded`}
              />
              {addressError && <p className="text-sm text-red-800 mt-1">{addressError}</p>}
              {loading && <p className="text-sm text-gray-500 mt-1">Loading Safe info…</p>}
              {version && <p className="text-sm text-gray-700 mt-1">Safe version {version}</p>}
            </div>

            <div>
              <label htmlFor="nested-safe-nonce" className="block text-sm font-semibold text-gray-700 mb-1">
                Nonce
              </label>
              <input
                id="nested-safe-nonce"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded sm:max-w-xs"
              />
              {nonceError && <p className="text-sm text-red-800 mt-1">{nonceError}</p>}
            </div>

            {/* Only when neither the chain nor the service reported a version. */}
            {looked && !version && (
              <div>
                <label htmlFor="nested-safe-version" className="block text-sm font-semibold text-gray-700 mb-1">
                  Safe version
                </label>
                <input
                  id="nested-safe-version"
                  type="text"
                  autoComplete="off"
                  value={versionInput}
                  onChange={(e) => setVersionInput(e.target.value)}
                  className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded sm:max-w-xs"
                />
                <p className="text-sm text-red-800 mt-1">Version could not be fetched. Enter it.</p>
              </div>
            )}

            {computed && 'error' in computed && <p className="text-sm text-red-800">{computed.error}</p>}

            {computed && 'result' in computed && (
              <div className="space-y-4 pt-2">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">approveHash transaction</p>
                  <dl className="text-sm space-y-2">
                    <div>
                      <dt className="text-gray-600">To</dt>
                      <dd className="font-mono break-all text-gray-900">{computed.result.transaction.to}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Data</dt>
                      <dd className="font-mono break-all text-gray-900">{computed.result.transaction.data}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Nonce</dt>
                      <dd className="font-mono text-gray-900">{String(computed.result.transaction.nonce)}</dd>
                    </div>
                  </dl>
                </div>

                <HashBlock label="Domain Hash:" value={computed.result.domainHash} uppercase={uppercase} />
                <HashBlock label="Message Hash:" value={computed.result.messageHash} uppercase={uppercase} />
                <HashBlock label="safeTxHash:" value={computed.result.safeTxHash} uppercase={uppercase} />
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
