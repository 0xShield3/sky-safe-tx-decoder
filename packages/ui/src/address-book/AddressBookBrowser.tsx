/**
 * Modal that lists one loaded config file (address book OR My Safes).
 * Surfaces parser-skipped rows too, so a signer can spot bad rows.
 */

import { useEffect } from 'react';
import type { AddressBookEntry, AddressBookSafe, AddressBookSkippedRow } from '@shield3/sky-safe-core';
import { EntryTable, SafeTable } from './tables';

interface AddressBookBrowserProps {
  title: string;
  filename: string;
  loadedAt: Date;
  /** Present when viewing an address book. */
  entries?: AddressBookEntry[];
  /** Present when viewing My Safes. */
  safes?: AddressBookSafe[];
  skipped: AddressBookSkippedRow[];
  onClose: () => void;
}

export function AddressBookBrowser({
  title,
  filename,
  loadedAt,
  entries,
  safes,
  skipped,
  onClose,
}: AddressBookBrowserProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = (entries ?? []).filter((e) => e.status === 'active');
  const inactive = (entries ?? []).filter((e) => e.status === 'inactive');
  const safeRows = safes ?? [];

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
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-gray-600 font-mono">
              {filename} · loaded {loadedAt.toLocaleString()}
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
          {safes !== undefined && (
            <section>
              <h3 className="text-sm font-semibold text-blue-800 mb-2">Safe Shortcuts ({safeRows.length})</h3>
              <SafeTable
                safes={[
                  ...safeRows.filter((s) => s.status === 'active'),
                  ...safeRows.filter((s) => s.status === 'inactive'),
                ]}
              />
            </section>
          )}

          {entries !== undefined && (
            <>
              <section>
                <h3 className="text-sm font-semibold text-green-800 mb-2">Active ({active.length})</h3>
                <EntryTable entries={active} />
              </section>

              {inactive.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-red-800 mb-2">Inactive ({inactive.length})</h3>
                  <EntryTable entries={inactive} />
                </section>
              )}
            </>
          )}

          {skipped.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">Skipped rows ({skipped.length})</h3>
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
                    {skipped.map((r, idx) => (
                      <tr key={idx} className="border-b border-yellow-100 last:border-0">
                        <td className="px-3 py-2 font-mono">{r.row}</td>
                        <td className="px-3 py-2">{r.reason}</td>
                        <td className="px-3 py-2 font-mono break-all">{r.raw}</td>
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
