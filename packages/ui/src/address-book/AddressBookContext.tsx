/**
 * Address Book session state.
 *
 * Intentionally in-memory only — no localStorage. Each session a signer
 * drags a fresh CSV in, which forces re-pull from the trusted source and
 * prevents a stale or tampered cached copy from drifting unnoticed.
 *
 * If a team later wants persistence, swap the useState below for
 * useLocalStorage and add a "Loaded: <timestamp>" indicator to the header.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  loadAddressBookCsv,
  unloadAddressBook,
  type AddressBookEntry,
  type AddressBookSkippedRow,
} from '@shield3/sky-safe-core';

interface AddressBookState {
  entries: AddressBookEntry[];
  skipped: AddressBookSkippedRow[];
  filename: string;
  loadedAt: Date;
}

interface AddressBookContextValue {
  state: AddressBookState | null;
  /** True when a book is loaded (any entries). Drives default rendering decisions. */
  loaded: boolean;
  /** Parse + register a CSV from the given file. Throws on schema errors. */
  load: (file: File) => Promise<void>;
  clear: () => void;
}

const AddressBookContext = createContext<AddressBookContextValue | null>(null);

export function AddressBookProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AddressBookState | null>(null);

  const load = useCallback(async (file: File) => {
    const text = await file.text();
    const result = loadAddressBookCsv(text);
    setState({
      entries: result.entries,
      skipped: result.skipped,
      filename: file.name,
      loadedAt: new Date(),
    });
  }, []);

  const clear = useCallback(() => {
    unloadAddressBook();
    setState(null);
  }, []);

  const value = useMemo<AddressBookContextValue>(
    () => ({
      state,
      loaded: state !== null && state.entries.length > 0,
      load,
      clear,
    }),
    [state, load, clear]
  );

  return <AddressBookContext.Provider value={value}>{children}</AddressBookContext.Provider>;
}

export function useAddressBook(): AddressBookContextValue {
  const ctx = useContext(AddressBookContext);
  if (!ctx) {
    throw new Error('useAddressBook must be used within an AddressBookProvider');
  }
  return ctx;
}
