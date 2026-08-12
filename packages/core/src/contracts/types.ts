/**
 * Per-network contract registry types.
 *
 * Each network has a list of well-known contract addresses we want to
 * surface in the UI with a friendly label. Add a new contract by editing
 * the appropriate network file (ethereum.ts, base.ts, sepolia.ts, ...).
 */

import type { AddressTag } from '../utils/address-tags.js'

export interface NetworkContract {
  address: string
  label: string
  description: string
  category: AddressTag['category']
  /**
   * ERC-20 decimals, for `category: 'token'` entries only.
   *
   * Hardcoded rather than read from the chain on demand. A live `decimals()`
   * call would let the network choose the number that scales an amount, so a
   * wrong or hostile RPC response would change the figure a signer reads while
   * the raw integer stayed correct. A table in the repository is reviewable,
   * identical for every user, and works in the offline build.
   *
   * Every value here was checked against the deployed contract's `decimals()`
   * and `symbol()` at the time it was added.
   */
  decimals?: number
}
