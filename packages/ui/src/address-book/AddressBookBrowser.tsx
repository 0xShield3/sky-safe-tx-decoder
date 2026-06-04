/**
 * Modal that lists the currently loaded address-book entries.
 * Surfaces parser-skipped rows too, so a signer can spot bad rows.
 */

import { useEffect } from 'react';
import type {
  AddressBookEntry,
  AddressBookSkippedRow,
} from '@shield3/sky-safe-core';

interface AddressBookBrowserProps {
  state: {
    entries: AddressBookEntry[];
    skipped: AddressBookSkippedRow[];
    filename: string;
    loadedAt: Date;
  };
  onClose: () => void;
}

export function AddressBookBrowser({ state, onClose }: AddressBookBrowserProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = state.entries.filter((e) => e.status === 'active');
  const inactive = state.entries.filter((e) => e.status === 'inactive');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Address Book</h2>
            <p className="text-xs text-gray-600 font-mono">
              {state.filename} · loaded {state.loadedAt.toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-green-800 mb-2">
              Active ({active.length})
            </h3>
            <EntryTable entries={active} />
          </section>

          {inactive.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-red-800 mb-2">
                Inactive ({inactive.length})
              </h3>
              <EntryTable entries={inactive} />
            </section>
          )}

          {state.skipped.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">
                Skipped rows ({state.skipped.length})
              </h3>
              <div className="border border-yellow-200 bg-yellow-50 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-yellow-900 border-b border-yellow-200">
                      <th className="px-3 py-2 w-16">Row</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.skipped.map((r, idx) => (
                      <tr key={idx} className="border-b border-yellow-100 last:border-0">
                        <td className="px-3 py-2 font-mono">{r.row}</td>
                        <td className="px-3 py-2">{r.reason}</td>
                        <td className="px-3 py-2 font-mono truncate max-w-xs">{r.raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryTable({ entries }: { entries: AddressBookEntry[] }) {
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
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.address} className="border-b last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono break-all">{e.address}</td>
              <td className="px-3 py-2">{e.label}</td>
              <td className="px-3 py-2 font-mono text-gray-600">
                {e.verificationDate || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
