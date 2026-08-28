/**
 * Nested Safe hashes — the hashes an owner Safe's own signers verify.
 *
 * An owner that is itself a Safe cannot sign. It approves by executing its own
 * Safe transaction calling `approveHash(bytes32)` on the parent, so its signers
 * see the hashes of that transaction instead of the parent's.
 *
 * The Safe address is a plain input: the owner list is not fetched here.
 * The nonce and version prefill from the Safe Transaction Service when it
 * answers, and both stay editable — a queued approveHash moves the next free
 * nonce past the one the service reports. The calculation itself is pure, so
 * entering both by hand works with no network at all.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  SafeApiClient,
  calculateNestedSafeTxHash,
  toChecksumAddress,
  type NestedSafeHashResult,
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
  const [addressInput, setAddressInput] = useState('');
  const [nonce, setNonce] = useState('');
  const [version, setVersion] = useState('');
  // What the Safe Transaction Service returned for the address currently
  // entered, kept so each field can say whether it still holds that value.
  const [fetched, setFetched] = useState<{ nonce: string; version: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const nestedAddress = toChecksumAddress(addressInput);
  const addressError = addressInput.trim() !== '' && !nestedAddress ? 'Not a 20-byte hex address.' : null;

  useEffect(() => {
    if (!nestedAddress) {
      setFetched(null);
      setFetchError(null);
      return;
    }

    let cancelled = false;
    setFetching(true);
    setFetchError(null);

    new SafeApiClient(network)
      .fetchSafeInfo(nestedAddress)
      .then((info) => {
        if (cancelled) return;
        const values = { nonce: String(info.nonce), version: info.version };
        setFetched(values);
        setNonce(values.nonce);
        setVersion(values.version);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFetched(null);
        setFetchError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nestedAddress, network]);

  const nonceError = nonce.trim() !== '' && !/^\d+$/.test(nonce.trim()) ? 'Nonce must be a whole number.' : null;

  const computed = useMemo((): { result: NestedSafeHashResult } | { error: string } | null => {
    if (!computedParentSafeTxHash) return null;
    if (!nestedAddress || nonceError || nonce.trim() === '' || version.trim() === '') return null;

    try {
      return {
        result: calculateNestedSafeTxHash({
          chainId,
          nestedSafeAddress: nestedAddress,
          nestedSafeNonce: nonce.trim(),
          nestedSafeVersion: version.trim(),
          parentSafeAddress: parentSafeAddress as `0x${string}`,
          parentSafeTxHash: computedParentSafeTxHash as `0x${string}`,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [chainId, nestedAddress, nonce, nonceError, version, parentSafeAddress, computedParentSafeTxHash]);

  const sourceNote = (value: string, fetchedValue: string | undefined) => {
    if (fetchedValue === undefined) return 'Entered';
    return value === fetchedValue ? `Safe API: ${fetchedValue}` : `Entered. Safe API: ${fetchedValue}`;
  };

  return (
    <details className="border border-gray-200 rounded-lg">
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
                className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded break-all"
              />
              {addressError && <p className="text-sm text-red-800 mt-1">{addressError}</p>}
              {fetching && <p className="text-sm text-gray-500 mt-1">Loading Safe info…</p>}
              {fetchError && (
                <p className="text-sm text-red-800 mt-1">
                  Safe info unavailable. Enter the nonce and version. ({fetchError})
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                  className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded"
                />
                <p className="text-xs text-gray-500 mt-1">{sourceNote(nonce, fetched?.nonce)}</p>
                {nonceError && <p className="text-sm text-red-800 mt-1">{nonceError}</p>}
              </div>

              <div>
                <label htmlFor="nested-safe-version" className="block text-sm font-semibold text-gray-700 mb-1">
                  Safe version
                </label>
                <input
                  id="nested-safe-version"
                  type="text"
                  autoComplete="off"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded"
                />
                <p className="text-xs text-gray-500 mt-1">{sourceNote(version, fetched?.version)}</p>
              </div>
            </div>

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
