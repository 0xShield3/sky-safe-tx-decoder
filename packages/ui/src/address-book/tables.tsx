/**
 * Shared tables for rendering address-book entries and Safe shortcuts.
 *
 * Read-only by default (AddressBookBrowser modal). Pass `onRemove` to get a
 * Remove action column (Settings page). Addresses are always rendered in full
 * (`break-all`, never truncated) — they feed signer trust decisions.
 */

import type { AddressBookEntry, AddressBookSafe } from '@shield3/sky-safe-core';

export function SafeTable({
  safes,
  onRemove,
}: {
  safes: AddressBookSafe[];
  onRemove?: (safe: AddressBookSafe) => void;
}) {
  if (safes.length === 0) {
    return <p className="text-xs text-gray-500">None.</p>;
  }
  return (
    <div className="border rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left bg-gray-50 border-b">
            <th className="px-3 py-2 w-28">Network</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 w-24">Status</th>
            {onRemove && <th className="px-3 py-2 w-20" />}
          </tr>
        </thead>
        <tbody>
          {safes.map((safe) => (
            <tr key={`${safe.network}:${safe.address}`} className="border-b last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono">{safe.network}</td>
              <td className="px-3 py-2 font-mono break-all">{safe.address}</td>
              <td className="px-3 py-2">{safe.label}</td>
              <td className="px-3 py-2">{safe.status}</td>
              {onRemove && (
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onRemove(safe)}
                    className="text-red-600 hover:underline"
                    aria-label={`Remove Safe ${safe.network} ${safe.address}`}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntryTable({
  entries,
  onRemove,
}: {
  entries: AddressBookEntry[];
  onRemove?: (entry: AddressBookEntry) => void;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-gray-500">None.</p>;
  }
  return (
    <div className="border rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left bg-gray-50 border-b">
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2 w-32">Verified</th>
            {onRemove && <th className="px-3 py-2 w-20" />}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.address} className="border-b last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono break-all">{e.address}</td>
              <td className="px-3 py-2">{e.label}</td>
              <td className="px-3 py-2 font-mono text-gray-600">{e.verificationDate || '—'}</td>
              {onRemove && (
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onRemove(e)}
                    className="text-red-600 hover:underline"
                    aria-label={`Remove address ${e.address}`}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
