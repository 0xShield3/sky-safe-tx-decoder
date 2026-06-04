/**
 * Address Tagging Utilities
 *
 * Provides human-readable labels for known contract addresses.
 * Tags can come from two sources:
 *   - 'built-in':     hardcoded protocol/Safe contracts shipped with this library
 *   - 'address-book': loaded at runtime from a signer's CSV address book
 *
 * Both sources share the same underlying map. When both exist for the same
 * address, callers can use `getAddressTags()` to retrieve both and render
 * them together (see UI <Address> component).
 */

import type { Address } from 'viem'
import {
  MULTISEND_CALL_ONLY,
  SAFE_MIGRATION,
  SIGN_MESSAGE_LIB,
  TRUSTED_MODULES,
} from '../security/constants.js'

export type AddressTagSource = 'built-in' | 'address-book'
export type AddressBookStatus = 'active' | 'inactive'

export interface AddressTag {
  label: string
  description: string
  category: 'safe-contract' | 'protocol' | 'token' | 'address-book' | 'other'
  source: AddressTagSource
  status?: AddressBookStatus
  verificationDate?: string
}

/**
 * Three buckets, each with independent lifecycle:
 *
 *   - CORE_BUILT_IN_TAGS:    chain-agnostic Safe protocol contracts
 *                            (MultiSendCallOnly etc.). Loaded at module init,
 *                            never cleared.
 *
 *   - NETWORK_BUILT_IN_TAGS: per-network contracts (WETH, USDC, USDS,
 *                            LockstakeEngine, etc.). Swapped by
 *                            loadNetworkContracts() when the UI navigates
 *                            between networks.
 *
 *   - ADDRESS_BOOK_TAGS:     entries loaded from a signer's CSV.
 *                            Cleared by clearAddressBookTags() / on unload.
 *
 * Lookup precedence (highest → lowest): address-book, network, core.
 * Both built-ins are surfaced together by getAddressTags() so the UI can show
 * "USDC · Vendor: Example Payments" when both apply.
 */
const CORE_BUILT_IN_TAGS = new Map<string, AddressTag>()
const NETWORK_BUILT_IN_TAGS = new Map<string, AddressTag>()
const ADDRESS_BOOK_TAGS = new Map<string, AddressTag>()

function registerCoreBuiltIn(address: string, tag: Omit<AddressTag, 'source'>): void {
  CORE_BUILT_IN_TAGS.set(address.toLowerCase(), { ...tag, source: 'built-in' })
}

/**
 * Internal: register a network-specific built-in. Use loadNetworkContracts()
 * from contracts/index.ts rather than calling this directly.
 */
export function _registerNetworkBuiltIn(address: string, tag: Omit<AddressTag, 'source'>): void {
  NETWORK_BUILT_IN_TAGS.set(address.toLowerCase(), { ...tag, source: 'built-in' })
}

/**
 * Internal: clear the per-network built-in bucket. Use clearNetworkContracts()
 * from contracts/index.ts rather than calling this directly.
 */
export function _clearNetworkBuiltIns(): void {
  NETWORK_BUILT_IN_TAGS.clear()
}

// MultiSendCallOnly contracts
for (const addr of MULTISEND_CALL_ONLY) {
  registerCoreBuiltIn(addr, {
    label: 'MultiSendCallOnly',
    description: 'Safe batching contract for multiple calls',
    category: 'safe-contract',
  })
}

// Safe Migration contracts
for (const addr of SAFE_MIGRATION) {
  registerCoreBuiltIn(addr, {
    label: 'SafeMigration',
    description: 'Safe contract migration library',
    category: 'safe-contract',
  })
}

// Sign Message Library contracts
for (const addr of SIGN_MESSAGE_LIB) {
  registerCoreBuiltIn(addr, {
    label: 'SignMessageLib',
    description: 'Off-chain message signing library',
    category: 'safe-contract',
  })
}

// Trusted modules
for (const addr of TRUSTED_MODULES) {
  registerCoreBuiltIn(addr, {
    label: 'Allowance Module',
    description: 'Spending limit module for Safe',
    category: 'safe-contract',
  })
}

// Burn addresses — chain-agnostic. Tokens sent here are unrecoverable.
// Tagging them so signers see the label rather than an "unknown address" tint,
// and so the address-book check classifies them as known rather than warning.
registerCoreBuiltIn('0x0000000000000000000000000000000000000000', {
  label: 'Burn Address',
  description: 'Zero address — tokens sent here are permanently destroyed',
  category: 'other',
})
registerCoreBuiltIn('0x000000000000000000000000000000000000dEaD', {
  label: 'Burn Address',
  description: '"dEaD" burn address — tokens sent here are permanently destroyed',
  category: 'other',
})

// Network-specific contracts (USDC, WETH, LockstakeEngine, ...) live in
// packages/core/src/contracts/<network>.ts and are loaded via
// loadNetworkContracts() from contracts/index.ts.

/**
 * Get the highest-precedence tag for an address.
 *
 * Precedence (highest → lowest): address-book, network built-in, core built-in.
 * Use {@link getAddressTags} for combined rendering of all matches.
 */
export function getAddressTag(address: Address): AddressTag | undefined {
  const key = address.toLowerCase()
  return (
    ADDRESS_BOOK_TAGS.get(key) ??
    NETWORK_BUILT_IN_TAGS.get(key) ??
    CORE_BUILT_IN_TAGS.get(key)
  )
}

/**
 * Get all tags registered for an address. Render order: core built-in,
 * network built-in, address-book. Any subset may match.
 */
export function getAddressTags(address: Address): AddressTag[] {
  const key = address.toLowerCase()
  const tags: AddressTag[] = []
  const core = CORE_BUILT_IN_TAGS.get(key)
  if (core) tags.push(core)
  const network = NETWORK_BUILT_IN_TAGS.get(key)
  if (network) tags.push(network)
  const book = ADDRESS_BOOK_TAGS.get(key)
  if (book) tags.push(book)
  return tags
}

export function hasAddressTag(address: Address): boolean {
  const key = address.toLowerCase()
  return (
    CORE_BUILT_IN_TAGS.has(key) ||
    NETWORK_BUILT_IN_TAGS.has(key) ||
    ADDRESS_BOOK_TAGS.has(key)
  )
}

/**
 * Register a tag at runtime. Address-book entries should pass
 * source: 'address-book' so they can be cleared independently. For
 * network-specific contracts use loadNetworkContracts() from
 * contracts/index.ts — calling this with source: 'built-in' puts the tag
 * in the core bucket that is never cleared by network swaps.
 */
export function registerAddressTag(address: Address, tag: AddressTag): void {
  const key = address.toLowerCase()
  if (tag.source === 'address-book') {
    ADDRESS_BOOK_TAGS.set(key, tag)
  } else {
    CORE_BUILT_IN_TAGS.set(key, tag)
  }
}

/**
 * Remove a single address-book entry. Built-ins are not affected.
 */
export function unregisterAddressBookTag(address: Address): void {
  ADDRESS_BOOK_TAGS.delete(address.toLowerCase())
}

/**
 * Remove all address-book entries. Built-ins are not affected.
 */
export function clearAddressBookTags(): void {
  ADDRESS_BOOK_TAGS.clear()
}

export function getAllAddressTags(): Array<[Address, AddressTag]> {
  const out: Array<[Address, AddressTag]> = []
  for (const [k, v] of CORE_BUILT_IN_TAGS) out.push([k as Address, v])
  for (const [k, v] of NETWORK_BUILT_IN_TAGS) out.push([k as Address, v])
  for (const [k, v] of ADDRESS_BOOK_TAGS) out.push([k as Address, v])
  return out
}

/**
 * Iterate just the address-book entries (for the browse panel).
 */
export function getAddressBookEntries(): Array<[Address, AddressTag]> {
  return Array.from(ADDRESS_BOOK_TAGS.entries()) as Array<[Address, AddressTag]>
}
