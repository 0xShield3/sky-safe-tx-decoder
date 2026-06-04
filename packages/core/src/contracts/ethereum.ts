/**
 * Well-known contracts on Ethereum mainnet (chainId 1).
 * Add a new contract by appending an entry to the array.
 */

import type { NetworkContract } from './types.js'

export const CONTRACTS: NetworkContract[] = [
  // Sky Protocol
  {
    address: '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3',
    label: 'LockstakeEngine',
    description: 'Sky Protocol staking and rewards contract',
    category: 'protocol',
  },

  // Stablecoins
  {
    address: '0xdAdB0d80202DF21f5b4cD68bA8E0fA8b62C28dDb',
    label: 'USDS',
    description: 'Sky USD stablecoin',
    category: 'token',
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    label: 'USDC',
    description: 'Circle USD stablecoin',
    category: 'token',
  },
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    label: 'USDT',
    description: 'Tether USD stablecoin',
    category: 'token',
  },
  {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    label: 'DAI',
    description: 'MakerDAO DAI stablecoin',
    category: 'token',
  },

  // Wrapped natives
  {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    label: 'WETH',
    description: 'Wrapped Ether (WETH9)',
    category: 'token',
  },

  // Major LSTs
  {
    address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    label: 'stETH',
    description: 'Lido Staked Ether',
    category: 'token',
  },
  {
    address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    label: 'wstETH',
    description: 'Lido Wrapped Staked Ether',
    category: 'token',
  },
]
