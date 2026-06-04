/**
 * Per-network well-known contract registry.
 *
 * To add support for a new network:
 *   1. Create packages/core/src/contracts/<network>.ts that exports
 *      `CONTRACTS: NetworkContract[]`.
 *   2. Register it in CONTRACTS_BY_NETWORK below.
 *
 * To add a new contract to an existing network: append to that network's
 * CONTRACTS array. No other code changes needed.
 *
 * Lifecycle: loadNetworkContracts(name) is called by the UI when the user
 * navigates to a network. It clears any previously loaded network bucket
 * and installs the entries for the new network. The chain-agnostic Safe
 * built-ins and the address-book bucket are not touched.
 */

import {
  _clearNetworkBuiltIns,
  _registerNetworkBuiltIn,
} from '../utils/address-tags.js'
import { CONTRACTS as ETHEREUM_CONTRACTS } from './ethereum.js'
import { CONTRACTS as BASE_CONTRACTS } from './base.js'
import { CONTRACTS as SEPOLIA_CONTRACTS } from './sepolia.js'
import type { NetworkContract } from './types.js'

export type { NetworkContract } from './types.js'

/**
 * Network name → contracts. Keys must match the names used in
 * src/api/networks.ts so the UI can pass the route's :network param directly.
 */
export const CONTRACTS_BY_NETWORK: Record<string, NetworkContract[]> = {
  ethereum: ETHEREUM_CONTRACTS,
  base: BASE_CONTRACTS,
  sepolia: SEPOLIA_CONTRACTS,
}

/**
 * Clear the previously loaded network bucket and load the given network's
 * contracts into the address-tag registry as built-ins.
 *
 * Safe to call repeatedly with the same network — it just rebuilds the bucket.
 * Unknown networks are tolerated (clears + loads nothing).
 */
export function loadNetworkContracts(network: string): void {
  _clearNetworkBuiltIns()
  const contracts = CONTRACTS_BY_NETWORK[network]
  if (!contracts) return
  for (const c of contracts) {
    _registerNetworkBuiltIn(c.address, {
      label: c.label,
      description: c.description,
      category: c.category,
    })
  }
}

/**
 * Clear the per-network built-in bucket. Call when leaving a network view
 * without immediately entering another. Address book and core built-ins
 * are untouched.
 */
export function clearNetworkContracts(): void {
  _clearNetworkBuiltIns()
}
