/**
 * Header strip for the address book.
 *
 *   Empty state: drag-and-drop zone + "browse files" trigger.
 *   Loaded state: filename, entry count, load timestamp, Browse + Clear buttons.
 *
 * Lives globally in App.tsx — drop a CSV once and every page picks it up.
 */

import { useRef, useState, type DragEvent } from 'react';
import { useAddressBook } from './AddressBookContext';
import { AddressBookBrowser } from './AddressBookBrowser';

function formatLoadedAt(d: Date): string {
  // Local time, short — signers want to glance and know if it's stale.
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AddressBookBar() {
  const { state, load, clear } = useAddressBook();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(`Expected a .csv file (got "${file.name}").`);
      return;
    }
    try {
      await load(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = () => {
    // Header only — explicitly NOT including an example row to avoid the risk
    // of a signer accidentally leaving placeholder data (including the zero
    // address) in their working CSV.
    const csv = 'address,label,verification_date,status\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'address-book-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-b bg-gray-50">
      <div className="container mx-auto px-4 py-2">
        {state === null ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex items-center justify-between gap-3 px-3 py-2 rounded border-2 border-dashed text-sm transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            <div className="text-gray-700">
              <span className="font-semibold">Address book:</span>{' '}
              Drag a CSV here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:underline"
              >
                browse files
              </button>
              {' · '}
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-blue-600 hover:underline"
              >
                download blank template
              </button>
              {' '}— highlights known vs unknown addresses.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded border border-green-300 bg-green-50 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-green-900">
              <span className="font-semibold">Address book loaded</span>
              <span className="text-xs text-green-800">
                <span className="font-mono">{state.filename}</span>
                {' · '}
                {state.entries.length} entr{state.entries.length === 1 ? 'y' : 'ies'}
                {state.skipped.length > 0 && (
                  <>
                    {', '}
                    <span className="text-yellow-800 font-semibold">{state.skipped.length} skipped</span>
                  </>
                )}
                {' · '}loaded {formatLoadedAt(state.loadedAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBrowser(true)}
                className="text-xs px-2 py-1 bg-white border border-green-400 text-green-800 rounded hover:bg-green-100"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={clear}
                className="text-xs px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
              >
                Clear
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-2 px-3 py-2 rounded border border-red-300 bg-red-50 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
      {showBrowser && state !== null && (
        <AddressBookBrowser
          state={state}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
