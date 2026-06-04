/**
 * Address Book CSV ingest.
 *
 * Format (header required):
 *   address,label,verification_date,status
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

import type { Address } from 'viem'
import {
  clearAddressBookTags,
  registerAddressTag,
  type AddressBookStatus,
  type AddressTag,
} from './address-tags.js'

export interface AddressBookEntry {
  address: Address
  label: string
  verificationDate: string
  status: AddressBookStatus
}

export interface AddressBookSkippedRow {
  /** 1-based line number in the source CSV (excluding the header). */
  row: number
  raw: string
  reason: string
}

export interface AddressBookParseResult {
  entries: AddressBookEntry[]
  skipped: AddressBookSkippedRow[]
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const REQUIRED_COLUMNS = ['address', 'label', 'verification_date', 'status'] as const

/**
 * Parse a CSV string into address-book entries. Does not mutate the tag registry.
 */
export function parseAddressBookCsv(csv: string): AddressBookParseResult {
  const entries: AddressBookEntry[] = []
  const skipped: AddressBookSkippedRow[] = []

  // Strip UTF-8 BOM
  const cleaned = csv.replace(/^﻿/, '')
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim() !== '')

  if (lines.length === 0) {
    throw new Error('Address book CSV is empty.')
  }

  const headerFields = splitCsvLine(lines[0]!).map((f) => f.trim().toLowerCase())
  for (const required of REQUIRED_COLUMNS) {
    if (!headerFields.includes(required)) {
      throw new Error(
        `Address book CSV missing required column "${required}". Required columns: ${REQUIRED_COLUMNS.join(', ')}.`
      )
    }
  }

  const addressIdx = headerFields.indexOf('address')
  const labelIdx = headerFields.indexOf('label')
  const dateIdx = headerFields.indexOf('verification_date')
  const statusIdx = headerFields.indexOf('status')

  // De-dupe by address (last wins); record the dropped earlier occurrence as skipped.
  const seen = new Map<string, number>() // lowercase address -> entries index

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i // 1-based row number after header
    const raw = lines[i]!
    const fields = splitCsvLine(raw).map((f) => f.trim())

    if (fields.length < REQUIRED_COLUMNS.length) {
      skipped.push({ row: rowNumber, raw, reason: 'too few columns' })
      continue
    }

    const address = fields[addressIdx] ?? ''
    const label = fields[labelIdx] ?? ''
    const verificationDate = fields[dateIdx] ?? ''
    const status = (fields[statusIdx] ?? '').toLowerCase()

    if (!ADDRESS_PATTERN.test(address)) {
      skipped.push({ row: rowNumber, raw, reason: `invalid address "${address}"` })
      continue
    }
    if (label === '') {
      skipped.push({ row: rowNumber, raw, reason: 'empty label' })
      continue
    }
    if (status !== 'active' && status !== 'inactive') {
      skipped.push({
        row: rowNumber,
        raw,
        reason: `status must be "active" or "inactive" (got "${status}")`,
      })
      continue
    }

    const key = address.toLowerCase()
    const existingIdx = seen.get(key)
    const entry: AddressBookEntry = {
      address: address as Address,
      label,
      verificationDate,
      status: status as AddressBookStatus,
    }
    if (existingIdx !== undefined) {
      // Last wins; surface the override so the signer can spot accidental dupes.
      skipped.push({
        row: rowNumber - 1,
        raw: 'previous entry for same address',
        reason: `duplicate of row ${rowNumber}; later entry kept`,
      })
      entries[existingIdx] = entry
    } else {
      seen.set(key, entries.length)
      entries.push(entry)
    }
  }

  return { entries, skipped }
}

/**
 * Parse + register all entries into the tag registry. Clears any previously
 * loaded address-book entries first. Built-in tags are untouched.
 */
export function loadAddressBookCsv(csv: string): AddressBookParseResult {
  const result = parseAddressBookCsv(csv)
  clearAddressBookTags()
  for (const entry of result.entries) {
    const tag: AddressTag = {
      label: entry.label,
      description:
        entry.status === 'active'
          ? `Address book entry (verified ${entry.verificationDate || 'n/a'})`
          : `INACTIVE address book entry (verified ${entry.verificationDate || 'n/a'})`,
      category: 'address-book',
      source: 'address-book',
      status: entry.status,
      verificationDate: entry.verificationDate,
    }
    registerAddressTag(entry.address, tag)
  }
  return result
}

/**
 * Wipe all loaded address-book entries.
 */
export function unloadAddressBook(): void {
  clearAddressBookTags()
}

/**
 * Split a single CSV line into fields. Supports quoted fields with embedded
 * commas and escaped quotes (RFC 4180-ish).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === ',') {
        fields.push(current)
        current = ''
      } else if (ch === '"' && current === '') {
        inQuotes = true
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}
