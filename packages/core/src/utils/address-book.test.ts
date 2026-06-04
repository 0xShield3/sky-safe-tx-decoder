/**
 * Tests for the address book CSV parser and loader.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAddressBookCsv,
  parseAddressBookCsv,
  unloadAddressBook,
} from './address-book.js';
import {
  clearAddressBookTags,
  getAddressBookEntries,
  getAddressTag,
  getAddressTags,
} from './address-tags.js';
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
    const { entries, skipped } = parseAddressBookCsv(VALID);
    expect(entries).toHaveLength(3);
    expect(skipped).toHaveLength(0);
    expect(entries[0]).toMatchObject({
      label: 'Sky LockstakeEngine (staking)',
      verificationDate: '2026-05-01',
      status: 'active',
    });
    expect(entries[2]!.status).toBe('inactive');
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
    expect(() => parseAddressBookCsv('address,label\n0x...,foo')).toThrow(
      /missing required column/
    );
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
