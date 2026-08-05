/**
 * Global banner shown when the Safe currently being viewed is not in the
 * signer's My Safes list. Lets them label it and add it to the in-session list.
 * It does NOT export — adding shouldn't trigger a download every time; the
 * signer exports once from Settings (or the config bar) when they're ready to
 * persist to their CSV.
 *
 * Mounted once in App.tsx, just under the address-config bar. Reads the active
 * Safe from the router via useMatch, so it works on any /safe/... page.
 *
 * Per the never-truncate rule, the full Safe address is always rendered.
 */

import { useState } from 'react';
import { useMatch } from 'react-router-dom';
import { isNetworkSupported, type AddressBookSafe } from '@shield3/sky-safe-core';
import { useAddressBook } from './AddressBookContext';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function safeKey(network: string, address: string): string {
  return `${network}:${address.toLowerCase()}`;
}

export function UnsavedSafePrompt() {
  const { mySafes, addSafe } = useAddressBook();
  const match = useMatch('/safe/:network/:address/*');
  const [label, setLabel] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const network = match?.params.network ?? '';
  const address = match?.params.address ?? '';

  // Only offer capture for a well-formed address on a supported network.
  if (!ADDRESS_PATTERN.test(address) || !isNetworkSupported(network)) {
    return null;
  }

  const key = safeKey(network, address);
  const alreadySaved = (mySafes?.safes ?? []).some(
    (s) => s.network === network && s.address.toLowerCase() === address.toLowerCase()
  );
  if (alreadySaved || dismissed.has(key)) {
    return null;
  }

  const trimmedLabel = label.trim();

  const handleAdd = () => {
    if (!trimmedLabel) return;
    const safe: AddressBookSafe = {
      address: address as `0x${string}`,
      label: trimmedLabel,
      verificationDate: '', // visited, not verified — left blank intentionally
      status: 'active',
      network,
    };
    addSafe(safe);
    setLabel('');
  };

  return (
    <div className="border-b bg-amber-50">
      <div className="container mx-auto px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="min-w-0">
            <span className="font-semibold">This Safe isn't in My Safes.</span>{' '}
            <span className="font-mono">{network}</span> <span className="font-mono break-all">{address}</span>
            <span className="block text-xs text-amber-800">
              Add it to your session list. Export from Settings when you want to save it to your CSV.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label this Safe…"
              className="px-2 py-1 border border-amber-300 rounded text-sm bg-white focus:ring-2 focus:ring-amber-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!trimmedLabel}
              className="text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to My Safes
            </button>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(key))}
              className="text-xs px-2 py-1 bg-white border border-amber-400 text-amber-800 rounded hover:bg-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
