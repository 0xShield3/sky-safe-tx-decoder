/**
 * Custom decoder types and interfaces
 */

import type { Address, Hex } from 'viem'

/**
 * Decoded function call with human-readable explanation
 */
export interface DecodedFunction {
  /** Function name (e.g., "lock") */
  name: string

  /** Function signature (e.g., "lock(address,uint256,uint256,uint16)") */
  signature: string

  /** Decoded parameters */
  parameters: Array<{
    name: string
    type: string
    value: string | bigint | boolean
  }>

  /** Human-readable explanation of what this function does */
  explanation: string

  /**
   * The contract this call is addressed to.
   *
   * Set by decoders that unpack a batch, where each nested call has its own
   * target. A renderer shows it on the call itself, so the raw and the decoded
   * halves of one call stay together instead of being listed twice.
   */
  target?: Address

  /**
   * The complete calldata of this call, exactly as signed.
   *
   * Set alongside `target` for a nested call. Always the full byte sequence — a
   * renderer may put it behind a disclosure, and must never shorten it.
   */
  rawCalldata?: Hex

  /** Warnings specific to this function */
  warnings?: string[]

  /** Risk level */
  riskLevel?: 'none' | 'low' | 'medium' | 'high'
}

/**
 * Result of decoding a transaction that may contain nested calls
 */
export interface DecodedTransactionData {
  /** Main function call */
  main: DecodedFunction

  /** Nested calls (e.g., from multicall) */
  nested?: DecodedFunction[]

  /** Whether this is a multicall */
  isMulticall: boolean

  /** General warnings about the transaction */
  generalWarnings?: string[]
}

/**
 * Custom decoder interface for specific contracts
 */
export interface CustomDecoder {
  /** Contract address this decoder handles */
  readonly contractAddress: Address

  /** Contract name for display */
  readonly contractName: string

  /** Network this decoder is for (optional, defaults to all networks) */
  readonly network?: string

  /**
   * Check if this decoder can handle the given transaction
   */
  canDecode(to: Address, data: Hex): boolean

  /**
   * Decode the transaction data
   * @returns Decoded transaction with explanations
   * @throws {Error} if decoding fails
   */
  decode(data: Hex): DecodedTransactionData

  /**
   * Get list of supported function signatures
   * Used to warn about unsupported functions
   */
  getSupportedFunctions(): string[]
}
