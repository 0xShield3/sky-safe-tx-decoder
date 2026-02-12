/**
 * Safe Transaction Service network configurations
 * Port of bash script lines 238-318
 *
 * @see https://docs.safe.global/advanced/smart-account-supported-networks
 */

import type { NetworkConfig } from '../types.js'

const BASE_URL = 'https://api.safe.global/tx-service'

/**
 * Supported networks mapped to their Safe Transaction Service API URLs and chain IDs
 * Starting with ethereum, can expand to all 40+ networks later
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    name: 'ethereum',
    chainId: 1,
    apiUrl: `${BASE_URL}/eth`,
    safePrefix: 'eth',
    etherscanUrl: 'https://etherscan.io',
  },
  sepolia: {
    name: 'sepolia',
    chainId: 11155111,
    apiUrl: `${BASE_URL}/sep`,
    safePrefix: 'sep',
    etherscanUrl: 'https://sepolia.etherscan.io',
  },
  // Can add more networks as needed:
  // arbitrum: { name: 'arbitrum', chainId: 42161, apiUrl: `${BASE_URL}/arb1`, safePrefix: 'arb1', etherscanUrl: 'https://arbiscan.io' },
  // base: { name: 'base', chainId: 8453, apiUrl: `${BASE_URL}/base`, safePrefix: 'base', etherscanUrl: 'https://basescan.org' },
  // optimism: { name: 'optimism', chainId: 10, apiUrl: `${BASE_URL}/oeth`, safePrefix: 'oeth', etherscanUrl: 'https://optimistic.etherscan.io' },
  // polygon: { name: 'polygon', chainId: 137, apiUrl: `${BASE_URL}/pol`, safePrefix: 'matic', etherscanUrl: 'https://polygonscan.com' },
}

/**
 * Default network to use when none is specified
 */
export const DEFAULT_NETWORK = 'ethereum'

/**
 * Get network configuration by name
 * @throws {Error} if network is not supported
 */
export function getNetwork(name: string): NetworkConfig {
  const network = NETWORKS[name]
  if (!network) {
    const supportedNetworks = Object.keys(NETWORKS).join(', ')
    throw new Error(
      `Unsupported network: "${name}". Supported networks: ${supportedNetworks}`
    )
  }
  return network
}

/**
 * Get all supported network names
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORKS)
}

/**
 * Check if a network is supported
 */
export function isNetworkSupported(name: string): boolean {
  return name in NETWORKS
}

/**
 * Get Safe UI URL for a Safe address
 * @param network - Network name
 * @param address - Safe address
 * @returns URL to Safe UI (e.g., https://app.safe.global/home?safe=eth:0x...)
 */
export function getSafeUrl(network: string, address: string): string {
  const config = getNetwork(network)
  return `https://app.safe.global/home?safe=${config.safePrefix}:${address}`
}

/**
 * Get Etherscan URL for an address
 * @param network - Network name
 * @param address - Address to view
 * @returns URL to Etherscan (e.g., https://etherscan.io/address/0x...)
 */
export function getEtherscanAddressUrl(network: string, address: string): string {
  const config = getNetwork(network)
  return `${config.etherscanUrl}/address/${address}`
}

/**
 * Get Etherscan URL for a transaction
 * @param network - Network name
 * @param txHash - Transaction hash
 * @returns URL to Etherscan transaction (e.g., https://etherscan.io/tx/0x...)
 */
export function getEtherscanTxUrl(network: string, txHash: string): string {
  const config = getNetwork(network)
  return `${config.etherscanUrl}/tx/${txHash}`
}
