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
}
