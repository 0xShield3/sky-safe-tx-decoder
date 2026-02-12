/**
 * Safe Transaction Service API Client
 * Port of bash script lines 1289-1348 (API fetching logic)
 *
 * @see https://docs.safe.global/core-api/transaction-service-reference
 */

import type { Address } from 'viem'
import type {
  SafeApiMultisigTransactionResponse,
  SafeApiMultisigTransaction,
  SafeApiSafeInfo,
} from '../types.js'
import { getNetwork } from './networks.js'

/**
 * Error thrown when Safe API request fails
 */
export class SafeApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message)
    this.name = 'SafeApiError'
  }
}

/**
 * Callback for retry notifications
 */
export type RetryCallback = (message: string, attempt: number, maxRetries: number, delay: number) => void

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  onRetry?: RetryCallback
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Check if it's a rate limit error (429)
      const isRateLimit =
        error instanceof SafeApiError &&
        (error.statusCode === 429 ||
          error.message.toLowerCase().includes('rate limit'))

      // Don't retry non-rate-limit errors
      if (!isRateLimit || attempt === maxRetries) {
        throw error
      }

      // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s...
      const delay = initialDelay * Math.pow(2, attempt)
      const message = `Rate limited. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`

      console.warn(message)

      // Notify callback if provided
      if (onRetry) {
        onRetry(message, attempt + 1, maxRetries, delay)
      }

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Safe Transaction Service API Client
 */
export class SafeApiClient {
  private readonly baseUrl: string
  private readonly chainId: number
  private readonly networkName: string
  private readonly onRetry?: RetryCallback

  constructor(network: string = 'ethereum', onRetry?: RetryCallback) {
    const networkConfig = getNetwork(network)
    this.baseUrl = networkConfig.apiUrl
    this.chainId = networkConfig.chainId
    this.networkName = networkConfig.name
    this.onRetry = onRetry
  }

  /**
   * Fetch all Safe multisig transactions by nonce (handles multiple with same nonce)
   *
   * @param safeAddress - Safe multisig address (must be checksummed)
   * @param nonce - Transaction nonce
   * @returns Array of transactions with this nonce
   * @throws {SafeApiError} if request fails or no transaction found
   */
  async fetchTransactionsByNonce(
    safeAddress: Address,
    nonce: number
  ): Promise<SafeApiMultisigTransaction[]> {
    return retryWithBackoff(async () => {
      const endpoint = `${this.baseUrl}/api/v2/safes/${safeAddress}/multisig-transactions/?nonce=${nonce}`

      try {
        const response = await fetch(endpoint)

        if (!response.ok) {
          throw new SafeApiError(
            `Safe API request failed: ${response.statusText}`,
            response.status
          )
        }

        const data = (await response.json()) as SafeApiMultisigTransactionResponse

        // Check if any transactions were found
        if (data.count === 0 || data.results.length === 0) {
          throw new SafeApiError(
            `No transaction found for Safe ${safeAddress} at nonce ${nonce}`
          )
        }

        return data.results
      } catch (error) {
        if (error instanceof SafeApiError) {
          throw error
        }

        // Handle network errors
        throw new SafeApiError(
          `Failed to fetch transaction: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          error
        )
      }
    }, 3, 1000, this.onRetry)
  }

  /**
   * Fetch Safe multisig transaction by nonce
   * Port of bash script endpoint construction (line 1197)
   *
   * @param safeAddress - Safe multisig address (must be checksummed)
   * @param nonce - Transaction nonce
   * @returns Transaction data from Safe Transaction Service
   * @throws {SafeApiError} if request fails or no transaction found
   */
  async fetchTransaction(
    safeAddress: Address,
    nonce: number
  ): Promise<SafeApiMultisigTransaction> {
    const endpoint = `${this.baseUrl}/api/v2/safes/${safeAddress}/multisig-transactions/?nonce=${nonce}`

    try {
      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new SafeApiError(
          `Safe API request failed: ${response.statusText}`,
          response.status
        )
      }

      const data = (await response.json()) as SafeApiMultisigTransactionResponse

      // Check if any transactions were found
      if (data.count === 0 || data.results.length === 0) {
        throw new SafeApiError(
          `No transaction found for Safe ${safeAddress} at nonce ${nonce}`
        )
      }

      // Warn if multiple transactions found (can happen with transaction replacement)
      if (data.count > 1) {
        console.warn(
          `⚠️  Warning: Multiple transactions (${data.count}) found with nonce ${nonce}. Using the first one.`
        )
        console.warn(
          `   This is normal if you're replacing an existing transaction.`
        )
        console.warn(`   API endpoint: ${endpoint}\n`)
      }

      // Return the first transaction
      return data.results[0]!
    } catch (error) {
      if (error instanceof SafeApiError) {
        throw error
      }

      // Handle network errors
      throw new SafeApiError(
        `Failed to fetch transaction: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      )
    }
  }

  /**
   * Fetch all transactions for a Safe
   * Reference: https://docs.safe.global/core-api/transaction-service-reference/mainnet#List-Transactions
   *
   * @param safeAddress - Safe multisig address
   * @param limit - Maximum number of transactions to fetch (default: 20)
   * @returns Transaction list response from Safe Transaction Service
   * @throws {SafeApiError} if request fails
   */
  async fetchTransactions(
    safeAddress: Address,
    limit: number = 20
  ): Promise<SafeApiMultisigTransactionResponse> {
    return retryWithBackoff(async () => {
      const endpoint = `${this.baseUrl}/api/v1/safes/${safeAddress}/multisig-transactions/?limit=${limit}`

      try {
        const response = await fetch(endpoint)

        if (!response.ok) {
          throw new SafeApiError(
            `Safe API request failed: ${response.statusText}`,
            response.status
          )
        }

        const data = (await response.json()) as SafeApiMultisigTransactionResponse
        return data
      } catch (error) {
        if (error instanceof SafeApiError) {
          throw error
        }

        throw new SafeApiError(
          `Failed to fetch transactions: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          error
        )
      }
    }, 3, 1000, this.onRetry)
  }

  /**
   * Fetch Safe contract version
   * Port of bash script lines 1200-1204
   *
   * @param safeAddress - Safe multisig address
   * @returns Safe contract version (e.g., "1.3.0", "1.4.1+L2")
   * @throws {SafeApiError} if request fails (including after retries)
   */
  async fetchSafeVersion(safeAddress: Address): Promise<string> {
    return retryWithBackoff(async () => {
      const endpoint = `${this.baseUrl}/api/v1/safes/${safeAddress}/`

      try {
        const response = await fetch(endpoint)

        if (!response.ok) {
          throw new SafeApiError(
            `Failed to fetch Safe version: ${response.statusText}`,
            response.status
          )
        }

        const data = (await response.json()) as SafeApiSafeInfo
        return data.version || '0.0.0'
      } catch (error) {
        if (error instanceof SafeApiError) {
          throw error
        }

        // Handle network errors
        throw new SafeApiError(
          `Failed to fetch Safe version: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          error
        )
      }
    }, 3, 1000, this.onRetry)
  }

  /**
   * Get the network name for this client
   */
  getNetworkName(): string {
    return this.networkName
  }

  /**
   * Get the chain ID for this client
   */
  getChainId(): number {
    return this.chainId
  }
}

/**
 * Create a Safe API client for a specific network
 */
export function createSafeApiClient(network: string = 'ethereum'): SafeApiClient {
  return new SafeApiClient(network)
}
