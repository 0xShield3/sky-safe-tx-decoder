/**
 * Address config session state — two independent files:
 *
 *   - Address book (managed): labels for known addresses, owned/updated by the
 *     team. Read-only in the app; drop a fresh file anytime to replace it.
 *   - My Safes (personal): the signer's own Safe shortcuts (the home dropdown).
 *     The only file that is edited (capture/remove) and exported.
 *
 * Keeping them separate avoids a sync trap: updating the managed book never
 * touches your Safes, and capturing a Safe never forces you to re-merge the
 * book. Both are in-memory only (no localStorage); the files you keep externally
 * are the source of truth and are re-loaded each session.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildAddressBookTag,
  classifyConfigCsv,
  clearAddressBookTags,
  parseAddressBookCsv,
  registerAddressTag,
  serializeAddressBookCsv,
  type AddressBookEntry,
  type AddressBookSafe,
  type AddressBookSkippedRow,
} from '@shield3/sky-safe-core';

export interface AddressBookSlot {
  entries: AddressBookEntry[];
  skipped: AddressBookSkippedRow[];
  filename: string;
  loadedAt: Date;
}

export interface MySafesSlot {
  safes: AddressBookSafe[];
  skipped: AddressBookSkippedRow[];
  filename: string;
  loadedAt: Date;
}

interface AddressBookContextValue {
  /** Managed address book (labels). Read-only. */
  addressBook: AddressBookSlot | null;
  /** Personal Safe shortcuts. Editable + exportable. */
  mySafes: MySafesSlot | null;
  /** Load a managed address-book CSV. Throws if the file is the wrong kind. */
  loadAddressBook: (file: File) => Promise<void>;
  /** Load a personal My Safes CSV. Throws if the file is the wrong kind. */
  loadMySafes: (file: File) => Promise<void>;
  clearAddressBook: () => void;
  clearMySafes: () => void;
  /** Add (or update, last-wins) a Safe shortcut in My Safes. */
  addSafe: (safe: AddressBookSafe) => void;
  /** Remove a Safe shortcut by network + address. */
  removeSafe: (network: string, address: string) => void;
  /** Serialize My Safes back to CSV (with kind marker). */
  exportMySafes: () => string;
}

const AddressBookContext = createContext<AddressBookContextValue | null>(null);

function lc(address: string): string {
  return address.toLowerCase();
}

export function AddressBookProvider({ children }: { children: ReactNode }) {
  const [addressBook, setAddressBook] = useState<AddressBookSlot | null>(null);
  const [mySafes, setMySafes] = useState<MySafesSlot | null>(null);

  // Rebuild the shared address-book tag bucket from BOTH sources whenever
  // either slot changes. Centralizing here lets the two files coexist instead
  // of clobbering each other's tags.
  useEffect(() => {
    clearAddressBookTags();
    for (const e of addressBook?.entries ?? []) registerAddressTag(e.address, buildAddressBookTag(e));
    for (const s of mySafes?.safes ?? []) registerAddressTag(s.address, buildAddressBookTag(s));
  }, [addressBook, mySafes]);

  const loadAddressBook = useCallback(async (file: File) => {
    const text = await file.text();
    const { kind } = classifyConfigCsv(text);
    if (kind === 'my-safes') {
      throw new Error('This looks like a "My Safes" file (Safe rows). Load it under My Safes, not Address book.');
    }
    if (kind === 'mixed') {
      throw new Error('Address book files should contain only address labels, but this file also has Safe rows.');
    }
    const result = parseAddressBookCsv(text);
    setAddressBook({
      entries: result.entries,
      skipped: result.skipped,
      filename: file.name,
      loadedAt: new Date(),
    });
  }, []);

  const loadMySafes = useCallback(async (file: File) => {
    const text = await file.text();
    const { kind } = classifyConfigCsv(text);
    if (kind === 'address-book') {
      throw new Error(
        'This looks like an Address book file (address labels). Load it under Address book, not My Safes.'
      );
    }
    if (kind === 'mixed') {
      throw new Error('My Safes files should contain only Safe rows, but this file also has address labels.');
    }
    const result = parseAddressBookCsv(text);
    setMySafes({
      safes: result.safes,
      skipped: result.skipped,
      filename: file.name,
      loadedAt: new Date(),
    });
  }, []);

  const clearAddressBook = useCallback(() => setAddressBook(null), []);
  const clearMySafes = useCallback(() => setMySafes(null), []);

  const addSafe = useCallback((safe: AddressBookSafe) => {
    setMySafes((prev) => {
      const base: MySafesSlot = prev ?? {
        safes: [],
        skipped: [],
        filename: 'my-safes.csv',
        loadedAt: new Date(),
      };
      const key = lc(safe.address);
      const safes = [...base.safes];
      const idx = safes.findIndex((s) => s.network === safe.network && lc(s.address) === key);
      if (idx >= 0) safes[idx] = safe;
      else safes.push(safe);
      return { ...base, safes };
    });
  }, []);

  const removeSafe = useCallback((network: string, address: string) => {
    setMySafes((prev) => {
      if (!prev) return prev;
      const key = lc(address);
      return { ...prev, safes: prev.safes.filter((s) => !(s.network === network && lc(s.address) === key)) };
    });
  }, []);

  const value = useMemo<AddressBookContextValue>(
    () => ({
      addressBook,
      mySafes,
      loadAddressBook,
      loadMySafes,
      clearAddressBook,
      clearMySafes,
      addSafe,
      removeSafe,
      exportMySafes: () => serializeAddressBookCsv({ entries: [], safes: mySafes?.safes ?? [] }, { kind: 'my-safes' }),
    }),
    [addressBook, mySafes, loadAddressBook, loadMySafes, clearAddressBook, clearMySafes, addSafe, removeSafe]
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
