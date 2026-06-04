/**
 * Well-known contracts on Base (chainId 8453).
 * Add a new contract by appending an entry to the array.
 */

import type { NetworkContract } from './types.js'

export const CONTRACTS: NetworkContract[] = [
  // Stablecoins
  {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    label: 'USDC',
    description: 'Circle USD stablecoin (native Base)',
    category: 'token',
  },
  {
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    label: 'USDbC',
    description: 'Bridged USD Coin (legacy)',
    category: 'token',
  },

  // Wrapped natives
  {
    address: '0x4200000000000000000000000000000000000006',
    label: 'WETH',
    description: 'Wrapped Ether (Base)',
    category: 'token',
  },
]
