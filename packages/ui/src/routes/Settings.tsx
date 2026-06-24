/**
 * Settings page — manage the in-session config.
 *
 *   - My Safes (personal): editable (remove) + exportable. Capture adds here.
 *   - Address book (managed): read-only; replace by loading a fresh file.
 *
 * Config is session-only (no localStorage); the CSV files you keep externally
 * are the source of truth. Drag them onto the bar above to load each session.
 */

import { useAddressBook } from '../address-book/AddressBookContext';
import { EntryTable, SafeTable } from '../address-book/tables';
import { downloadCsv } from '../address-book/download';
import type { AddressBookSkippedRow } from '@shield3/sky-safe-core';

function SkippedRows({ skipped }: { skipped: AddressBookSkippedRow[] }) {
  if (skipped.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold text-yellow-800 mb-1">Skipped rows ({skipped.length})</h4>
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
    </div>
  );
}

export default function Settings() {
  const { addressBook, mySafes, removeSafe, exportMySafes } = useAddressBook();

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2">Settings</h2>
        <p className="text-gray-600">
          Manage the config loaded this session. Changes are in memory only — export to CSV to save them. The CSV files
          you keep externally are the source of truth; drag them onto the bar above to load them each session.
        </p>
      </div>

      {/* My Safes — editable + exportable */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xl font-semibold">My Safes</h3>
            <p className="text-sm text-gray-600">Your personal Safe shortcuts (the home-page dropdown).</p>
          </div>
          {mySafes && mySafes.safes.length > 0 && (
            <button
              type="button"
              onClick={() => downloadCsv(mySafes.filename, exportMySafes())}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Export My Safes (CSV)
            </button>
          )}
        </div>
        {mySafes ? (
          <>
            <SafeTable safes={mySafes.safes} onRemove={(safe) => removeSafe(safe.network, safe.address)} />
            <SkippedRows skipped={mySafes.skipped} />
          </>
        ) : (
          <p className="text-sm text-gray-500">
            No My Safes file loaded. Open a Safe and use the capture banner to add one, or drag a My Safes CSV onto the
            bar above.
          </p>
        )}
      </section>

      {/* Address book — managed, read-only */}
      <section>
        <h3 className="text-xl font-semibold mb-1">Address book (managed)</h3>
        <p className="text-sm text-gray-600 mb-3">
          Read-only labels for known addresses. Managed externally — replace it by loading a fresh file on the bar
          above.
        </p>
        {addressBook ? (
          <>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-green-800 mb-2">
                  Active ({addressBook.entries.filter((e) => e.status === 'active').length})
                </h4>
                <EntryTable entries={addressBook.entries.filter((e) => e.status === 'active')} />
              </div>
              {addressBook.entries.some((e) => e.status === 'inactive') && (
                <div>
                  <h4 className="text-sm font-semibold text-red-800 mb-2">
                    Inactive ({addressBook.entries.filter((e) => e.status === 'inactive').length})
                  </h4>
                  <EntryTable entries={addressBook.entries.filter((e) => e.status === 'inactive')} />
                </div>
              )}
            </div>
            <SkippedRows skipped={addressBook.skipped} />
          </>
        ) : (
          <p className="text-sm text-gray-500">No address book loaded. Drag your managed CSV onto the bar above.</p>
        )}
      </section>
    </div>
  );
}
