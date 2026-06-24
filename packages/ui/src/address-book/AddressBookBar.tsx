/**
 * Header strip for the address config — two independent files:
 *   - Address book (managed): labels, read-only, replaceable.
 *   - My Safes (personal): Safe shortcuts, editable + exportable.
 *
 * Lives globally in App.tsx — drop files once and every page picks them up.
 * Each slot validates the dropped file's kind and rejects the wrong one.
 */

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useAddressBook } from './AddressBookContext';
import { AddressBookBrowser } from './AddressBookBrowser';
import { downloadCsv } from './download';

const HEADER = 'type,network,address,label,verification_date,status';
const ADDRESS_BOOK_TEMPLATE = `# sky-safe-config: address-book\n${HEADER}\n`;
const MY_SAFES_TEMPLATE = `# sky-safe-config: my-safes\n${HEADER}\n`;

function formatLoadedAt(d: Date): string {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AddressBookBar() {
  const { addressBook, mySafes, loadAddressBook, loadMySafes, clearAddressBook, clearMySafes, exportMySafes } =
    useAddressBook();

  return (
    <div className="border-b bg-gray-50">
      <div className="container mx-auto px-4 py-2 grid gap-2 md:grid-cols-2">
        <ConfigSlot
          title="Address book (managed)"
          hint="labels known addresses during review"
          accentLoaded="border-green-300 bg-green-50 text-green-900"
          templateFilename="address-book-template.csv"
          templateCsv={ADDRESS_BOOK_TEMPLATE}
          onLoad={loadAddressBook}
          onClear={clearAddressBook}
          summary={
            addressBook ? `${addressBook.entries.length} entr${addressBook.entries.length === 1 ? 'y' : 'ies'}` : null
          }
          loaded={
            addressBook
              ? { filename: addressBook.filename, loadedAt: addressBook.loadedAt, skipped: addressBook.skipped.length }
              : null
          }
          renderBrowser={(onClose) =>
            addressBook ? (
              <AddressBookBrowser
                title="Address book"
                filename={addressBook.filename}
                loadedAt={addressBook.loadedAt}
                entries={addressBook.entries}
                skipped={addressBook.skipped}
                onClose={onClose}
              />
            ) : null
          }
        />

        <ConfigSlot
          title="My Safes"
          hint="your Safe shortcuts on the home page"
          accentLoaded="border-blue-300 bg-blue-50 text-blue-900"
          templateFilename="my-safes-template.csv"
          templateCsv={MY_SAFES_TEMPLATE}
          onLoad={loadMySafes}
          onClear={clearMySafes}
          onExport={mySafes ? () => downloadCsv(mySafes.filename, exportMySafes()) : undefined}
          summary={mySafes ? `${mySafes.safes.length} Safe${mySafes.safes.length === 1 ? '' : 's'}` : null}
          loaded={
            mySafes ? { filename: mySafes.filename, loadedAt: mySafes.loadedAt, skipped: mySafes.skipped.length } : null
          }
          renderBrowser={(onClose) =>
            mySafes ? (
              <AddressBookBrowser
                title="My Safes"
                filename={mySafes.filename}
                loadedAt={mySafes.loadedAt}
                safes={mySafes.safes}
                skipped={mySafes.skipped}
                onClose={onClose}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}

interface ConfigSlotProps {
  title: string;
  hint: string;
  accentLoaded: string;
  templateFilename: string;
  templateCsv: string;
  onLoad: (file: File) => Promise<void>;
  onClear: () => void;
  onExport?: () => void;
  summary: string | null;
  loaded: { filename: string; loadedAt: Date; skipped: number } | null;
  renderBrowser: (onClose: () => void) => ReactNode;
}

function ConfigSlot({
  title,
  hint,
  accentLoaded,
  templateFilename,
  templateCsv,
  onLoad,
  onClear,
  onExport,
  summary,
  loaded,
  renderBrowser,
}: ConfigSlotProps) {
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
      await onLoad(file);
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

  return (
    <div>
      {loaded === null ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex h-full flex-col justify-center gap-1 px-3 py-2 rounded border-2 border-dashed text-sm transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
        >
          <div className="text-gray-700">
            <span className="font-semibold">{title}:</span> drag a CSV here, or{' '}
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
              onClick={() => downloadCsv(templateFilename, templateCsv)}
              className="text-blue-600 hover:underline"
            >
              blank template
            </button>
          </div>
          <div className="text-xs text-gray-500">{hint}</div>
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
        <div
          className={`flex h-full flex-wrap items-center justify-between gap-3 px-3 py-2 rounded border text-sm ${accentLoaded}`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{title}</span>
            <span className="text-xs">
              <span className="font-mono">{loaded.filename}</span>
              {' · '}
              {summary}
              {loaded.skipped > 0 && (
                <>
                  {', '}
                  <span className="text-yellow-800 font-semibold">{loaded.skipped} skipped</span>
                </>
              )}
              {' · '}loaded {formatLoadedAt(loaded.loadedAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBrowser(true)}
              className="text-xs px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
            >
              View
            </button>
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                className="text-xs px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
              >
                Export
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                onClear();
              }}
              className="text-xs px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-1 px-3 py-2 rounded border border-red-300 bg-red-50 text-sm text-red-800">{error}</div>
      )}
      {showBrowser && renderBrowser(() => setShowBrowser(false))}
    </div>
  );
}
