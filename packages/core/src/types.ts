/**
 * Core TypeScript types for Safe transaction handling
 * Ported from safe-tx-hashes-util bash script
 */

import type { Address, Hash, Hex } from 'viem'

/**
 * Supported Safe contract versions
 * @see https://github.com/safe-global/safe-smart-account
 */
export type SafeVersion = string // e.g., "1.3.0", "1.4.1", "1.5.0+L2"

/**
 * Safe transaction operation type
 * @see https://github.com/safe-global/safe-smart-account/blob/main/contracts/libraries/Enum.sol
 */
export enum Operation {
  Call = 0,
  DelegateCall = 1,
}

/**
 * Safe transaction data structure
 * Maps to Safe.sol execTransaction parameters
 */
export interface SafeTransactionData {
  to: Address
  value: bigint | string
  data: Hex
  operation: Operation
  safeTxGas: bigint | string
  baseGas: bigint | string
  gasPrice: bigint | string
  gasToken: Address
  refundReceiver: Address
  nonce: bigint | string
}

/**
 * Network configuration for Safe Transaction Service API
 */
export interface NetworkConfig {
  name: string
  chainId: number
  apiUrl: string
  /** Short prefix used by Safe UI (e.g., 'eth', 'sep') */
  safePrefix: string
  /** Etherscan base URL */
  etherscanUrl: string
}

/**
 * Computed hashes for a Safe transaction
 */
export interface SafeTransactionHashes {
  domainHash: Hash
  messageHash: Hash
  safeTxHash: Hash
}

/**
 * Result of transaction decoding
 */
export interface DecodedTransaction {
  method: string
  parameters: Array<{
    name: string
    type: string
    value: string | bigint | boolean
  }>
  warnings?: string[]
  riskLevel?: 'none' | 'low' | 'medium' | 'high'
}

/**
 * Safe Transaction Service API response types
 * @see https://docs.safe.global/core-api/transaction-service-reference
 */

/**
 * Response from /api/v2/safes/{address}/multisig-transactions/?nonce={nonce}
 */
export interface SafeApiMultisigTransactionResponse {
  count: number
  next: string | null
  previous: string | null
  results: SafeApiMultisigTransaction[]
}

/**
 * Individual multisig transaction from Safe Transaction Service
 */
export interface SafeApiMultisigTransaction {
  safe: Address
  to: Address
  value: string
  data: Hex | null
  operation: number
  gasToken: Address
  safeTxGas: number
  baseGas: number
  gasPrice: string
  refundReceiver: Address
  nonce: number
  executionDate: string | null
  submissionDate: string
  modified: string
  blockNumber: number | null
  transactionHash: string | null
  safeTxHash: string
  executor: Address | null
  isExecuted: boolean
  isSuccessful: boolean | null
  ethGasPrice: string | null
  maxFeePerGas: string | null
  maxPriorityFeePerGas: string | null
  gasUsed: number | null
  fee: string | null
  origin: string | null
  dataDecoded: SafeApiDataDecoded | null
  confirmationsRequired: number
  confirmations: SafeApiConfirmation[]
  trusted: boolean
  signatures: string | null
}

/**
 * Nested transaction within MultiSend (from Safe API valueDecoded)
 */
export interface SafeApiNestedTransaction {
  operation: number
  to: string
  value: string
  data: string
  dataDecoded?: SafeApiDataDecoded | null
}

/**
 * Decoded transaction data from Safe Transaction Service
 */
export interface SafeApiDataDecoded {
  method: string
  parameters: Array<{
    name: string
    type: string
    value: string
    /**
     * For MultiSend transactions, this contains an array of nested transactions
     * For other types, this may contain structured data
     */
    valueDecoded?: SafeApiNestedTransaction[] | unknown
  }>
}

/**
 * Transaction confirmation from a Safe owner
 */
export interface SafeApiConfirmation {
  owner: Address
  submissionDate: string
  transactionHash: string | null
  signature: string
  signatureType: string
}

/**
 * Response from /api/v1/safes/{address}/
 */
export interface SafeApiSafeInfo {
  address: Address
  nonce: number
  threshold: number
  owners: Address[]
  masterCopy: Address
  modules: Address[]
  fallbackHandler: Address
  guard: Address
  version: string
}
