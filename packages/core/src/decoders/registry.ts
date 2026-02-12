/**
 * Decoder registry for managing custom contract decoders
 */

import type { Address, Hex } from 'viem'
import type { CustomDecoder, DecodedTransactionData } from './types.js'

/**
 * Registry for custom contract decoders
 * Allows registering and looking up decoders by contract address
 */
export class DecoderRegistry {
  private decoders = new Map<string, CustomDecoder>()

  /**
   * Register a custom decoder
   */
  register(decoder: CustomDecoder): void {
    const key = this.makeKey(decoder.contractAddress, decoder.network)
    this.decoders.set(key, decoder)
  }

  /**
   * Get decoder for a specific contract address and network
   */
  getDecoder(address: Address, network?: string): CustomDecoder | undefined {
    // Try network-specific decoder first
    if (network) {
      const networkKey = this.makeKey(address, network)
      const decoder = this.decoders.get(networkKey)
      if (decoder) return decoder
    }

    // Fall back to network-agnostic decoder
    const genericKey = this.makeKey(address, undefined)
    return this.decoders.get(genericKey)
  }

  /**
   * Decode transaction using registered decoder (if available)
   * Returns undefined if no decoder found or decoding not supported
   */
  decode(to: Address, data: Hex, network?: string): DecodedTransactionData | undefined {
    const decoder = this.getDecoder(to, network)
    if (!decoder || !decoder.canDecode(to, data)) {
      return undefined
    }

    try {
      return decoder.decode(data)
    } catch (error) {
      console.warn(
        `Failed to decode transaction with ${decoder.contractName} decoder:`,
        error instanceof Error ? error.message : String(error)
      )
      return undefined
    }
  }

  /**
   * Check if a decoder exists for a contract
   */
  hasDecoder(address: Address, network?: string): boolean {
    return this.getDecoder(address, network) !== undefined
  }

  /**
   * Get all registered decoders
   */
  getAllDecoders(): CustomDecoder[] {
    return Array.from(this.decoders.values())
  }

  /**
   * Make a map key from address and optional network
   */
  private makeKey(address: Address, network?: string): string {
    const normalizedAddress = address.toLowerCase()
    return network ? `${network}:${normalizedAddress}` : normalizedAddress
  }
}

/**
 * Global decoder registry instance
 */
export const decoderRegistry = new DecoderRegistry()
