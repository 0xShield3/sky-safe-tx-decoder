/**
 * Tests for the address book CSV parser and loader.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyConfigCsv,
  loadAddressBookCsv,
  parseAddressBookCsv,
  readConfigKind,
  serializeAddressBookCsv,
  unloadAddressBook,
} from './address-book.js';
import { clearAddressBookTags, getAddressBookEntries, getAddressTag, getAddressTags } from './address-tags.js';
import { loadNetworkContracts, clearNetworkContracts } from '../contracts/index.js';

// Sky LockstakeEngine — a per-network built-in (loaded for ethereum).
const LOCKSTAKE_ENGINE = '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3' as `0x${string}`;

const VALID = [
  'address,label,verification_date,status',
  '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,Sky LockstakeEngine (staking),2026-05-01,active',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7,Vendor: Example Payments LLC,2026-04-15,active',
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,Vendor: Contractor Studio (former),2025-11-20,inactive',
].join('\n');

beforeEach(() => {
  clearAddressBookTags();
  clearNetworkContracts();
});

describe('parseAddressBookCsv', () => {
  it('parses a valid CSV', () => {
    const { entries, safes, skipped } = parseAddressBookCsv(VALID);
    expect(entries).toHaveLength(3);
    expect(safes).toHaveLength(0);
    expect(skipped).toHaveLength(0);
    expect(entries[0]).toMatchObject({
      label: 'Sky LockstakeEngine (staking)',
      verificationDate: '2026-05-01',
      status: 'active',
      type: 'address',
    });
    expect(entries[2]!.status).toBe('inactive');
  });

  it('parses Safe shortcut rows from optional config columns', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active',
      'address,,0xdAC17F958D2ee523a2206206994597C13D831ec7,Vendor: Example Payments LLC,2026-04-15,active',
    ].join('\n');
    const { entries, safes, skipped } = parseAddressBookCsv(csv);
    expect(entries).toHaveLength(2);
    expect(safes).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(safes[0]).toMatchObject({
      address: '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d',
      label: 'Treasury Safe',
      network: 'ethereum',
      status: 'active',
      verificationDate: '2026-05-10',
    });
  });

  it('skips Safe shortcut rows with missing or unsupported networks', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'safe,,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Missing Network,2026-05-10,active',
      'safe,unknown,0xdAC17F958D2ee523a2206206994597C13D831ec7,Unknown Network,2026-04-15,active',
      'address,,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,USDC,2026-04-15,active',
    ].join('\n');
    const { entries, safes, skipped } = parseAddressBookCsv(csv);
    expect(entries).toHaveLength(1);
    expect(safes).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]!.reason).toMatch(/require a network/);
    expect(skipped[1]!.reason).toMatch(/unsupported safe network/);
  });

  it('tolerates a UTF-8 BOM at the start of the file', () => {
    const withBom = '﻿' + VALID;
    const { entries } = parseAddressBookCsv(withBom);
    expect(entries).toHaveLength(3);
  });

  it('tolerates CRLF line endings and trailing blank lines', () => {
    const crlf = VALID.replace(/\n/g, '\r\n') + '\r\n\r\n';
    const { entries } = parseAddressBookCsv(crlf);
    expect(entries).toHaveLength(3);
  });

  it('skips rows with invalid addresses but keeps parsing', () => {
    const csv = [
      'address,label,verification_date,status',
      'not-an-address,Bad row,2026-01-01,active',
      '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,Good,2026-05-01,active',
    ].join('\n');
    const { entries, skipped } = parseAddressBookCsv(csv);
    expect(entries).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/invalid address/);
  });

  it('skips rows with invalid status', () => {
    const csv = [
      'address,label,verification_date,status',
      '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,X,2026-05-01,maybe',
    ].join('\n');
    const { entries, skipped } = parseAddressBookCsv(csv);
    expect(entries).toHaveLength(0);
    expect(skipped[0]!.reason).toMatch(/status must be/);
  });

  it('throws on missing required columns', () => {
    expect(() => parseAddressBookCsv('address,label\n0x...,foo')).toThrow(/missing required column/);
  });

  it('throws on empty input', () => {
    expect(() => parseAddressBookCsv('')).toThrow(/empty/);
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = [
      'address,label,verification_date,status',
      '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,"Vendor, with comma",2026-05-01,active',
    ].join('\n');
    const { entries } = parseAddressBookCsv(csv);
    expect(entries[0]!.label).toBe('Vendor, with comma');
  });

  it('handles quoted fields with escaped quotes', () => {
    const csv = [
      'address,label,verification_date,status',
      '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,"Vendor ""Quoted""",2026-05-01,active',
    ].join('\n');
    const { entries } = parseAddressBookCsv(csv);
    expect(entries[0]!.label).toBe('Vendor "Quoted"');
  });

  it('treats duplicates as last-wins and surfaces the override', () => {
    const csv = [
      'address,label,verification_date,status',
      '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,First,2026-05-01,active',
      '0xce01c90de7fd1bcfa39e237fe6d8d9f569e8a6a3,Second,2026-05-02,active',
    ].join('\n');
    const { entries, skipped } = parseAddressBookCsv(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toBe('Second');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/duplicate/);
  });
});

describe('serializeAddressBookCsv', () => {
  it('round-trips entries and safes through parse', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active',
      'safe,base,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,Ops Safe,2026-05-09,inactive',
      'address,,0xdAC17F958D2ee523a2206206994597C13D831ec7,Vendor: Example Payments LLC,2026-04-15,active',
      'address,,0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,Sky LockstakeEngine,2026-05-01,active',
    ].join('\n');
    const original = parseAddressBookCsv(csv);
    const reparsed = parseAddressBookCsv(serializeAddressBookCsv(original));
    expect(reparsed.entries).toEqual(original.entries);
    expect(reparsed.safes).toEqual(original.safes);
    expect(reparsed.skipped).toHaveLength(0);
  });

  it('preserves one address used as a Safe on multiple networks', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury (eth),2026-05-10,active',
      'safe,base,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury (base),2026-05-10,active',
    ].join('\n');
    const original = parseAddressBookCsv(csv);
    expect(original.safes).toHaveLength(2);
    const reparsed = parseAddressBookCsv(serializeAddressBookCsv(original));
    expect(reparsed.safes).toHaveLength(2);
    expect(reparsed.safes).toEqual(original.safes);
  });

  it('escapes labels containing commas and quotes', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'address,,0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,"Vendor, ""Quoted"" LLC",2026-05-01,active',
    ].join('\n');
    const original = parseAddressBookCsv(csv);
    const serialized = serializeAddressBookCsv(original);
    expect(serialized).toContain('"Vendor, ""Quoted"" LLC"');
    expect(parseAddressBookCsv(serialized).entries[0]!.label).toBe('Vendor, "Quoted" LLC');
  });

  it('does not double-emit safe-typed entries as plain address rows', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active',
    ].join('\n');
    const original = parseAddressBookCsv(csv);
    const serialized = serializeAddressBookCsv(original);
    const dataLines = serialized.trim().split('\n').slice(1);
    expect(dataLines).toHaveLength(1);
    expect(dataLines[0]!.startsWith('safe,')).toBe(true);
  });

  it('writes a kind marker that parses back cleanly', () => {
    const csv = [
      'type,network,address,label,verification_date,status',
      'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active',
    ].join('\n');
    const original = parseAddressBookCsv(csv);
    const serialized = serializeAddressBookCsv(original, { kind: 'my-safes' });
    expect(serialized.startsWith('# sky-safe-config: my-safes')).toBe(true);
    expect(readConfigKind(serialized)).toBe('my-safes');
    const reparsed = parseAddressBookCsv(serialized);
    expect(reparsed.safes).toEqual(original.safes);
    expect(reparsed.skipped).toHaveLength(0);
  });
});

describe('config-kind markers and classification', () => {
  const SAFES = [
    'type,network,address,label,verification_date,status',
    'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active',
  ].join('\n');
  const ADDRESSES = [
    'type,network,address,label,verification_date,status',
    'address,,0xdAC17F958D2ee523a2206206994597C13D831ec7,Vendor,2026-04-15,active',
  ].join('\n');

  it('parser skips leading comment lines (including the marker)', () => {
    const { entries, safes } = parseAddressBookCsv(`# sky-safe-config: my-safes\n${SAFES}`);
    expect(safes).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });

  it('readConfigKind returns the marker, or null when absent', () => {
    expect(readConfigKind(`# sky-safe-config: address-book\n${ADDRESSES}`)).toBe('address-book');
    expect(readConfigKind(`# sky-safe-config: my-safes\n${SAFES}`)).toBe('my-safes');
    expect(readConfigKind(ADDRESSES)).toBeNull();
    expect(readConfigKind('# something else\n' + ADDRESSES)).toBeNull();
  });

  it('classifyConfigCsv prefers the marker over inferred content', () => {
    // Marker says my-safes even though content is addresses — marker wins.
    const c = classifyConfigCsv(`# sky-safe-config: my-safes\n${ADDRESSES}`);
    expect(c.kind).toBe('my-safes');
    expect(c.marker).toBe('my-safes');
  });

  it('classifyConfigCsv infers kind from content when no marker', () => {
    expect(classifyConfigCsv(ADDRESSES)).toMatchObject({ kind: 'address-book', marker: null });
    expect(classifyConfigCsv(SAFES)).toMatchObject({ kind: 'my-safes', marker: null });
  });

  it('classifyConfigCsv flags mixed and empty files', () => {
    const mixed = [
      'type,network,address,label,verification_date,status',
      'safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active',
      'address,,0xdAC17F958D2ee523a2206206994597C13D831ec7,Vendor,2026-04-15,active',
    ].join('\n');
    expect(classifyConfigCsv(mixed).kind).toBe('mixed');
    expect(classifyConfigCsv('type,network,address,label,verification_date,status').kind).toBe('empty');
  });
});

describe('loadAddressBookCsv', () => {
  it('registers entries into the tag registry', () => {
    loadAddressBookCsv(VALID);
    const tag = getAddressTag('0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`);
    expect(tag?.source).toBe('address-book');
    expect(tag?.label).toBe('Vendor: Example Payments LLC');
    expect(tag?.status).toBe('active');
  });

  it('coexists with network built-in tags (getAddressTags returns both)', () => {
    loadNetworkContracts('ethereum');
    loadAddressBookCsv(VALID);
    const tags = getAddressTags(LOCKSTAKE_ENGINE);
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.source).sort()).toEqual(['address-book', 'built-in']);
  });

  it('clears previous address-book entries on reload', () => {
    loadAddressBookCsv(VALID);
    expect(getAddressBookEntries()).toHaveLength(3);

    const minimal = [
      'address,label,verification_date,status',
      '0x0000000000000000000000000000000000000001,Only,2026-05-01,active',
    ].join('\n');
    loadAddressBookCsv(minimal);
    expect(getAddressBookEntries()).toHaveLength(1);
  });

  it('unloadAddressBook clears only address-book entries, not built-ins', () => {
    loadNetworkContracts('ethereum');
    loadAddressBookCsv(VALID);
    unloadAddressBook();
    expect(getAddressBookEntries()).toHaveLength(0);
    // Network built-in still resolves.
    const tag = getAddressTag(LOCKSTAKE_ENGINE);
    expect(tag?.source).toBe('built-in');
    expect(tag?.label).toBe('LockstakeEngine');
  });
});
