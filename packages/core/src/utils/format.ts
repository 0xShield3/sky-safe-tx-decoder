/**
 * Formatting utilities
 * Port of format_hash() from safe_hashes.sh (line 480-485)
 */

import type { Hash } from 'viem'

/**
 * Format hash to match Ledger display style:
 * - Lowercase `0x` prefix
 * - Uppercase hex digits
 *
 * @example
 * formatHash('0xaabbccdd...') => '0xAABBCCDD...'
 */
export function formatHash(hash: Hash): string {
  if (!hash.startsWith('0x')) {
    throw new Error('Hash must start with 0x prefix')
  }

  const prefix = hash.slice(0, 2).toLowerCase() // '0x'
  const rest = hash.slice(2).toUpperCase() // hex digits

  return prefix + rest
}
