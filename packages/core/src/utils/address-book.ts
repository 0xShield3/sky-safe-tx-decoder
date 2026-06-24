/**
 * Address Book CSV ingest.
 *
 * Format (header required):
 *   address,label,verification_date,status
 *
 * Optional config columns:
 *   type,network
 *
 * - type: 'address' | 'safe' (defaults to 'address')
 * - network: required when type is 'safe' (e.g. ethereum, base, sepolia)
 *
 * - address: 0x + 40 hex (case-insensitive; checksum not enforced)
 * - label: free text
 * - verification_date: free text (ISO 8601 YYYY-MM-DD recommended)
 * - status: 'active' | 'inactive'
 *
 * Parser is intentionally small. Handles:
 *   - UTF-8 BOM at start of file
 *   - CRLF or LF line endings
 *   - Trailing blank lines
 *   - Quoted fields ("..."), including embedded commas and escaped quotes ("")
 *   - Whitespace around fields (trimmed)
 *
 * Returns parsed entries plus a `skipped` list so the UI can show
 * "loaded 47, skipped 3 (invalid address)" rather than failing silently.
 */

import type { Address } from 'viem';
import { clearAddressBookTags, registerAddressTag, type AddressBookStatus, type AddressTag } from './address-tags.js';
import { isNetworkSupported } from '../api/networks.js';

export type AddressBookEntryType = 'address' | 'safe';

export interface AddressBookEntry {
  address: Address;
  label: string;
  verificationDate: string;
  status: AddressBookStatus;
  type: AddressBookEntryType;
}

export interface AddressBookSafe {
  address: Address;
  label: string;
  verificationDate: string;
  status: AddressBookStatus;
  network: string;
}

export interface AddressBookSkippedRow {
  /** 1-based line number in the source CSV (excluding the header). */
  row: number;
  raw: string;
  reason: string;
}

export interface AddressBookParseResult {
  entries: AddressBookEntry[];
  safes: AddressBookSafe[];
  skipped: AddressBookSkippedRow[];
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const REQUIRED_COLUMNS = ['address', 'label', 'verification_date', 'status'] as const;

/**
 * Parse a CSV string into address-book entries. Does not mutate the tag registry.
 */
export function parseAddressBookCsv(csv: string): AddressBookParseResult {
  const entries: AddressBookEntry[] = [];
  const safes: AddressBookSafe[] = [];
  const skipped: AddressBookSkippedRow[] = [];

  // Strip UTF-8 BOM. Drop blank lines and `#` comment lines (the config-kind
  // marker is a comment line — see CONFIG_MARKER_PREFIX / readConfigKind).
  const cleaned = csv.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

  if (lines.length === 0) {
    throw new Error('Address book CSV is empty.');
  }

  const headerFields = splitCsvLine(lines[0]!).map((f) => f.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!headerFields.includes(required)) {
      throw new Error(
        `Address book CSV missing required column "${required}". Required columns: ${REQUIRED_COLUMNS.join(', ')}.`
      );
    }
  }

  const addressIdx = headerFields.indexOf('address');
  const labelIdx = headerFields.indexOf('label');
  const dateIdx = headerFields.indexOf('verification_date');
  const statusIdx = headerFields.indexOf('status');
  const typeIdx = headerFields.indexOf('type');
  const networkIdx = headerFields.indexOf('network');

  // De-dupe by address (last wins); record the dropped earlier occurrence as skipped.
  const seen = new Map<string, number>(); // lowercase address -> entries index
  const seenSafes = new Map<string, number>(); // network:lowercase address -> safes index

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i; // 1-based row number after header
    const raw = lines[i]!;
    const fields = splitCsvLine(raw).map((f) => f.trim());

    if (fields.length < REQUIRED_COLUMNS.length) {
      skipped.push({ row: rowNumber, raw, reason: 'too few columns' });
      continue;
    }

    const address = fields[addressIdx] ?? '';
    const label = fields[labelIdx] ?? '';
    const verificationDate = fields[dateIdx] ?? '';
    const status = (fields[statusIdx] ?? '').toLowerCase();
    const type = ((typeIdx >= 0 ? fields[typeIdx] : '') || 'address').toLowerCase();
    const network = (networkIdx >= 0 ? fields[networkIdx] : '') ?? '';

    if (!ADDRESS_PATTERN.test(address)) {
      skipped.push({ row: rowNumber, raw, reason: `invalid address "${address}"` });
      continue;
    }
    if (label === '') {
      skipped.push({ row: rowNumber, raw, reason: 'empty label' });
      continue;
    }
    if (status !== 'active' && status !== 'inactive') {
      skipped.push({
        row: rowNumber,
        raw,
        reason: `status must be "active" or "inactive" (got "${status}")`,
      });
      continue;
    }
    if (type !== 'address' && type !== 'safe') {
      skipped.push({
        row: rowNumber,
        raw,
        reason: `type must be "address" or "safe" (got "${type}")`,
      });
      continue;
    }
    if (type === 'safe') {
      if (network === '') {
        skipped.push({ row: rowNumber, raw, reason: 'safe rows require a network' });
        continue;
      }
      if (!isNetworkSupported(network)) {
        skipped.push({ row: rowNumber, raw, reason: `unsupported safe network "${network}"` });
        continue;
      }
    }

    const key = address.toLowerCase();
    const existingIdx = seen.get(key);
    const entry: AddressBookEntry = {
      address: address as Address,
      label,
      verificationDate,
      status: status as AddressBookStatus,
      type: type as AddressBookEntryType,
    };
    if (existingIdx !== undefined) {
      // Last wins; surface the override so the signer can spot accidental dupes.
      skipped.push({
        row: rowNumber - 1,
        raw: 'previous entry for same address',
        reason: `duplicate of row ${rowNumber}; later entry kept`,
      });
      entries[existingIdx] = entry;
    } else {
      seen.set(key, entries.length);
      entries.push(entry);
    }

    if (type === 'safe') {
      const safeKey = `${network}:${key}`;
      const existingSafeIdx = seenSafes.get(safeKey);
      const safe: AddressBookSafe = {
        address: address as Address,
        label,
        verificationDate,
        status: status as AddressBookStatus,
        network,
      };
      if (existingSafeIdx !== undefined) {
        skipped.push({
          row: rowNumber - 1,
          raw: 'previous Safe entry for same network/address',
          reason: `duplicate Safe for ${network}:${address}; later entry kept`,
        });
        safes[existingSafeIdx] = safe;
      } else {
        seenSafes.set(safeKey, safes.length);
        safes.push(safe);
      }
    }
  }

  return { entries, safes, skipped };
}

/** Column order for serialized CSVs. Mirrors the template in the UI. */
const SERIALIZE_COLUMNS = ['type', 'network', 'address', 'label', 'verification_date', 'status'] as const;

/**
 * The two roles a config file can play. An address book is managed externally
 * (labels only); my-safes is the signer's personal Safe-shortcut list.
 */
export type ConfigKind = 'address-book' | 'my-safes';

/** Leading comment line that self-identifies a config file's role. */
export const CONFIG_MARKER_PREFIX = '# sky-safe-config:';

/**
 * Read the explicit config-kind marker from the leading comment lines, if any.
 * Returns null when no recognized marker is present (e.g. an externally produced
 * address book, or a legacy file). Robust to BOM and leading blank lines.
 */
export function readConfigKind(csv: string): ConfigKind | null {
  const cleaned = csv.replace(/^﻿/, '');
  for (const rawLine of cleaned.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (!line.startsWith('#')) break; // first non-comment line ends the preamble
    const lower = line.toLowerCase();
    if (lower.startsWith(CONFIG_MARKER_PREFIX)) {
      const value = lower.slice(CONFIG_MARKER_PREFIX.length).trim();
      if (value === 'address-book' || value === 'my-safes') return value;
    }
  }
  return null;
}

export interface ConfigClassification {
  /** 'mixed' = both address and safe rows; 'empty' = neither. */
  kind: ConfigKind | 'mixed' | 'empty';
  /** The explicit marker if present, else null (kind was inferred from content). */
  marker: ConfigKind | null;
}

/**
 * Classify a config CSV so the UI can validate it against the slot it was
 * dropped on. An explicit marker wins; otherwise the kind is inferred from
 * content (the two roles are content-disjoint: address rows vs safe rows).
 */
export function classifyConfigCsv(csv: string): ConfigClassification {
  const marker = readConfigKind(csv);
  const { entries, safes } = parseAddressBookCsv(csv);
  const addressRows = entries.filter((e) => e.type === 'address').length;

  let kind: ConfigClassification['kind'];
  if (marker) {
    kind = marker;
  } else if (safes.length > 0 && addressRows === 0) {
    kind = 'my-safes';
  } else if (addressRows > 0 && safes.length === 0) {
    kind = 'address-book';
  } else if (addressRows > 0 && safes.length > 0) {
    kind = 'mixed';
  } else {
    kind = 'empty';
  }
  return { kind, marker };
}

/**
 * Serialize parsed config back into the canonical 6-column CSV. The output is a
 * round-trip of {@link parseAddressBookCsv}: re-parsing it reproduces the same
 * entries and safes (order aside).
 *
 * Safe rows are emitted from `safes` (carrying their network), and plain
 * address rows from the non-safe `entries`. Safe-typed entries are intentionally
 * NOT re-emitted from `entries` — they would lose their network and duplicate
 * the safe rows. Sourcing safe rows from `safes` also preserves a single
 * address used as a Safe on multiple networks, which `entries` (deduped by
 * address) cannot represent.
 *
 * Pass `kind` to prepend the self-identifying marker comment so the file can be
 * validated against the slot it is later loaded into.
 */
export function serializeAddressBookCsv(
  result: { entries: AddressBookEntry[]; safes: AddressBookSafe[] },
  options: { kind?: ConfigKind } = {}
): string {
  const lines: string[] = [];
  if (options.kind) {
    lines.push(`${CONFIG_MARKER_PREFIX} ${options.kind}`);
  }
  lines.push(SERIALIZE_COLUMNS.join(','));

  for (const safe of result.safes) {
    lines.push(
      ['safe', safe.network, safe.address, safe.label, safe.verificationDate, safe.status]
        .map(serializeCsvField)
        .join(',')
    );
  }

  for (const entry of result.entries) {
    if (entry.type !== 'address') continue;
    lines.push(
      ['address', '', entry.address, entry.label, entry.verificationDate, entry.status].map(serializeCsvField).join(',')
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * Quote a single CSV field when it contains a comma, double quote, or newline,
 * escaping embedded quotes by doubling them. Inverse of the quoting handled by
 * {@link splitCsvLine}.
 */
function serializeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build the tag registered for an address-book entry. Shared so loaded and
 * in-session-added entries register identically.
 */
export function buildAddressBookTag(entry: {
  label: string;
  status: AddressBookStatus;
  verificationDate: string;
}): AddressTag {
  return {
    label: entry.label,
    description:
      entry.status === 'active'
        ? `Address book entry (verified ${entry.verificationDate || 'n/a'})`
        : `INACTIVE address book entry (verified ${entry.verificationDate || 'n/a'})`,
    category: 'address-book',
    source: 'address-book',
    status: entry.status,
    verificationDate: entry.verificationDate,
  };
}

/**
 * Parse + register all entries into the tag registry. Clears any previously
 * loaded address-book entries first. Built-in tags are untouched.
 */
export function loadAddressBookCsv(csv: string): AddressBookParseResult {
  const result = parseAddressBookCsv(csv);
  clearAddressBookTags();
  for (const entry of result.entries) {
    registerAddressTag(entry.address, buildAddressBookTag(entry));
  }
  return result;
}

/**
 * Wipe all loaded address-book entries.
 */
export function unloadAddressBook(): void {
  clearAddressBookTags();
}

/**
 * Split a single CSV line into fields. Supports quoted fields with embedded
 * commas and escaped quotes (RFC 4180-ish).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') {
        fields.push(current);
        current = '';
      } else if (ch === '"' && current === '') {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
