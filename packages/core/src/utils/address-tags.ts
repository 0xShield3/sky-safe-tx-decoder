/**
 * Address Tagging Utilities
 *
 * Provides human-readable labels for known contract addresses
 */

import type { Address } from 'viem'
import {
  MULTISEND_CALL_ONLY,
  SAFE_MIGRATION,
  SIGN_MESSAGE_LIB,
  TRUSTED_MODULES,
} from '../security/constants.js'

export interface AddressTag {
  label: string
  description: string
  category: 'safe-contract' | 'protocol' | 'token' | 'other'
}

/**
 * Known address tags
 */
const ADDRESS_TAGS = new Map<string, AddressTag>()

// MultiSendCallOnly contracts
for (const addr of MULTISEND_CALL_ONLY) {
  ADDRESS_TAGS.set(addr.toLowerCase(), {
    label: 'MultiSendCallOnly',
    description: 'Safe batching contract for multiple calls',
    category: 'safe-contract',
  })
}

// Safe Migration contracts
for (const addr of SAFE_MIGRATION) {
  ADDRESS_TAGS.set(addr.toLowerCase(), {
    label: 'SafeMigration',
    description: 'Safe contract migration library',
    category: 'safe-contract',
  })
}

// Sign Message Library contracts
for (const addr of SIGN_MESSAGE_LIB) {
  ADDRESS_TAGS.set(addr.toLowerCase(), {
    label: 'SignMessageLib',
    description: 'Off-chain message signing library',
    category: 'safe-contract',
  })
}

// Trusted modules
for (const addr of TRUSTED_MODULES) {
  ADDRESS_TAGS.set(addr.toLowerCase(), {
    label: 'Allowance Module',
    description: 'Spending limit module for Safe',
    category: 'safe-contract',
  })
}

// Sky Protocol contracts
ADDRESS_TAGS.set('0xce01c90de7fd1bcfa39e237fe6d8d9f569e8a6a3', {
  label: 'LockstakeEngine',
  description: 'Sky Protocol staking and rewards contract',
  category: 'protocol',
})

/**
 * Get tag for an address
 *
 * @param address - Address to look up
 * @returns Tag if found, undefined otherwise
 */
export function getAddressTag(address: Address): AddressTag | undefined {
  return ADDRESS_TAGS.get(address.toLowerCase())
}

/**
 * Check if an address has a tag
 *
 * @param address - Address to check
 * @returns True if address is tagged
 */
export function hasAddressTag(address: Address): boolean {
  return ADDRESS_TAGS.has(address.toLowerCase())
}

/**
 * Register a custom address tag
 *
 * @param address - Address to tag
 * @param tag - Tag information
 */
export function registerAddressTag(address: Address, tag: AddressTag): void {
  ADDRESS_TAGS.set(address.toLowerCase(), tag)
}

/**
 * Get all tagged addresses
 *
 * @returns Array of [address, tag] pairs
 */
export function getAllAddressTags(): Array<[Address, AddressTag]> {
  return Array.from(ADDRESS_TAGS.entries()) as Array<[Address, AddressTag]>
}
