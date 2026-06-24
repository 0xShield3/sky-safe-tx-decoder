/**
 * Well-known contracts on Ethereum mainnet (chainId 1).
 * Add a new contract by appending an entry to the array.
 */

import type { NetworkContract } from './types.js';

export const CONTRACTS: NetworkContract[] = [
  // Sky Protocol — core contracts
  {
    address: '0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3',
    label: 'LockstakeEngine',
    description: 'Sky Protocol staking and rewards contract',
    category: 'protocol',
  },
  {
    address: '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB',
    label: 'MCD_Pause_proxy',
    description: 'Sky governance pause proxy — executes passed governance spells',
    category: 'protocol',
  },
  {
    address: '0x38E4254bD82ED5Ee97CD1C4278FAae748d998865',
    label: 'StakingRewards (USDS)',
    description: 'Sky StakingRewards — stake to earn USDS',
    category: 'protocol',
  },
  {
    address: '0xB44C2Fb4181D7Cb06bdFf34A46FdFe4a259B40Fc',
    label: 'StakingRewards (SKY)',
    description: 'Sky StakingRewards — stake to earn SKY',
    category: 'protocol',
  },
  {
    address: '0xA188EEC8F81263234dA3622A406892F3D630f98c',
    label: 'UsdsPsmWrapper',
    description: 'Sky USDS Peg Stability Module wrapper',
    category: 'protocol',
  },

  // Sky Protocol — tokens
  {
    address: '0x56072C95FAA701256059aa122697B133aDEd9279',
    label: 'SKY',
    description: 'Sky governance token',
    category: 'token',
  },
  {
    address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F',
    label: 'USDS',
    description: 'Sky USD stablecoin',
    category: 'token',
  },
  {
    address: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
    label: 'sUSDS',
    description: 'Sky Savings USDS (yield-bearing)',
    category: 'token',
  },

  // CoW Protocol
  {
    address: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
    label: 'GPv2Settlement',
    description: 'CoW Protocol settlement contract (also labeled "CoW Protocol (SWAP)")',
    category: 'protocol',
  },
  {
    address: '0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74',
    label: 'ComposableCoW',
    description: 'CoW Protocol conditional-order framework',
    category: 'protocol',
  },
  {
    address: '0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5',
    label: 'ComposableCoW (TWAP)',
    description: 'CoW Protocol TWAP order handler',
    category: 'protocol',
  },

  // Other stablecoins
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
];
