/**
 * Address Book Check
 *
 * When a signer has loaded an address book, every address the transaction
 * touches is expected to be a known, active entry.
 *
 * Addresses are pulled from:
 *   - top-level transaction `to`
 *   - nested MultiSend `to`s
 *   - additionalAddresses passed by the caller (decoded params: transfer.to,
 *     approve.spender, etc.)
 *
 * Per-address status:
 *   - missing from the book entirely      -> "unverified"  (medium warning)
 *   - present but marked status:inactive  -> "inactive"    (high warning)
 *   - present and active, OR matched by a built-in protocol tag -> "verified"
 *
 * Silent (no warnings, no risk) when no address book is loaded — otherwise
 * every transaction would flag every address as unknown.
 */

import type { Address, Hex } from 'viem'
import { decodeMultiSend } from './multisend-decoder.js'
import type { WarningLevel } from './types.js'
import {
  getAddressBookEntries,
  getAddressTag,
} from '../utils/address-tags.js'

export type AddressBookRecipientStatus = 'verified' | 'unverified' | 'inactive'

export interface AddressBookRecipient {
  address: Address
  status: AddressBookRecipientStatus
  /** The label from the address book if status === 'verified' | 'inactive' */
  label?: string
  /** True if the address was reached via MultiSend nesting. */
  isNested: boolean
  /** Where this address was found in the transaction. */
  source: 'to' | 'multisend' | 'param'
}

export interface AddressBookCheckResult {
  /** True when the signer has any address-book entries loaded. */
  addressBookLoaded: boolean
  /** Every address touched by the transaction. Empty when book not loaded. */
  recipients: AddressBookRecipient[]
  /** Addresses with status !== 'verified'. Empty when book not loaded. */
  warnings: AddressBookRecipient[]
  warningLevel?: WarningLevel
}

export interface AdditionalAddress {
  address: Address
  isNested?: boolean
}

export interface CheckAddressBookOptions {
  /**
   * The Safe address whose transaction we're checking. When provided, any
   * occurrence of this address is treated as known (label: "Your Safe") so
   * it never appears in warnings — even if it's not in the loaded book.
   */
  safeAddress?: Address
}

/**
 * Run the address-book check against a transaction.
 *
 * @param to - top-level transaction recipient
 * @param data - transaction calldata (used to find nested MultiSend recipients)
 * @param additionalAddresses - extra addresses (e.g. extracted from decoded
 *   params like transfer.to or approve.spender). Optional.
 * @param options - safeAddress, etc.
 */
export function checkAddressBook(
  to: Address,
  data: Hex,
  additionalAddresses: AdditionalAddress[] = [],
  options: CheckAddressBookOptions = {}
): AddressBookCheckResult {
  const addressBookLoaded = getAddressBookEntries().length > 0
  if (!addressBookLoaded) {
    return { addressBookLoaded: false, recipients: [], warnings: [] }
  }

  const recipients: AddressBookRecipient[] = []
  const seen = new Set<string>()
  const safeKey = options.safeAddress?.toLowerCase()

  const addAddress = (
    addr: Address | undefined,
    source: AddressBookRecipient['source'],
    isNested: boolean
  ) => {
    if (!addr) return
    // Note: we do NOT filter 0x0 here. The burn address is tagged as a core
    // built-in so it surfaces with a "Burn Address" label rather than as an
    // unknown/missing entry.
    const key = addr.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)

    // The Safe whose transaction we're checking is implicitly known — it's
    // the signer's own address. Resolves before falling back to the tag
    // registry so it works even when the Safe isn't in the loaded book.
    if (safeKey && key === safeKey) {
      recipients.push({
        address: addr,
        status: 'verified',
        label: 'Your Safe',
        isNested,
        source,
      })
      return
    }

    const tag = getAddressTag(addr)
    let status: AddressBookRecipientStatus
    let label: string | undefined
    if (tag?.source === 'address-book') {
      status = tag.status === 'inactive' ? 'inactive' : 'verified'
      label = tag.label
    } else if (tag) {
      // Built-in tag (e.g. LockstakeEngine, USDC) — counts as known.
      status = 'verified'
      label = tag.label
    } else {
      status = 'unverified'
    }
    recipients.push({ address: addr, status, label, isNested, source })
  }

  addAddress(to, 'to', false)

  // MultiSend nested recipients.
  const nested = decodeMultiSend(data)
  if (nested) {
    for (const tx of nested) {
      addAddress(tx.to as Address, 'multisend', true)
    }
  }

  // Caller-supplied additional addresses (decoded params).
  for (const extra of additionalAddresses) {
    addAddress(extra.address, 'param', extra.isNested === true)
  }

  const warnings = recipients.filter((r) => r.status !== 'verified')
  let warningLevel: WarningLevel | undefined
  if (warnings.some((r) => r.status === 'inactive')) {
    warningLevel = 'high'
  } else if (warnings.length > 0) {
    warningLevel = 'medium'
  }

  return {
    addressBookLoaded,
    recipients,
    warnings,
    warningLevel,
  }
}
