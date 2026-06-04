/**
 * Walk decoded transaction data and pull out every address-typed parameter
 * value. Handles both shapes used in this codebase:
 *   - SafeApiDataDecoded   (from Safe Transaction Service)
 *   - DecodedTransactionData / DecodedFunction (from custom decoder registry)
 *
 * Used by the UI to feed the address-book check beyond just tx.to. Address-typed
 * params include transfer.to, transferFrom.to, approve.spender, etc. — anything
 * whose Solidity type is `address` or `address[]`.
 */

import type { Address } from 'viem'
import type { SafeApiDataDecoded, SafeApiNestedTransaction } from '../types.js'
import type { DecodedFunction, DecodedTransactionData } from '../decoders/types.js'

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

function looksLikeAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value.trim())
}

function pushIfAddress(out: Address[], value: unknown): void {
  if (looksLikeAddress(value)) {
    out.push(value.trim() as Address)
  }
}

/**
 * Walk a SafeApiDataDecoded structure (possibly with nested MultiSend
 * transactions in valueDecoded) and return every address-typed param value.
 */
export function extractAddressesFromApiDecoded(
  decoded: SafeApiDataDecoded | null | undefined
): Address[] {
  if (!decoded?.parameters) return []
  const out: Address[] = []
  for (const param of decoded.parameters) {
    const type = (param.type || '').toLowerCase()
    if (type === 'address') {
      pushIfAddress(out, param.value)
    } else if (type === 'address[]' || type.startsWith('address[')) {
      // address[], address[2], etc. — value is usually a JSON array string.
      const raw = param.value
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(parsed)) {
          for (const v of parsed) pushIfAddress(out, v)
        }
      } catch {
        // not JSON — try comma-separated
        if (typeof raw === 'string') {
          for (const v of raw.split(',')) pushIfAddress(out, v.trim())
        }
      }
    }
    // Recurse into nested MultiSend transactions.
    if (Array.isArray(param.valueDecoded)) {
      for (const nested of param.valueDecoded as SafeApiNestedTransaction[]) {
        out.push(...extractAddressesFromApiDecoded(nested.dataDecoded))
      }
    }
  }
  return out
}

/**
 * Walk a DecodedFunction (from a custom decoder) and return address-typed values.
 */
export function extractAddressesFromDecodedFunction(
  fn: DecodedFunction | null | undefined
): Address[] {
  if (!fn?.parameters) return []
  const out: Address[] = []
  for (const param of fn.parameters) {
    const type = (param.type || '').toLowerCase()
    if (type === 'address') {
      pushIfAddress(out, param.value)
    } else if (type === 'address[]' || type.startsWith('address[')) {
      const raw = param.value
      if (Array.isArray(raw)) {
        for (const v of raw) pushIfAddress(out, v)
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            for (const v of parsed) pushIfAddress(out, v)
          }
        } catch {
          for (const v of raw.split(',')) pushIfAddress(out, v.trim())
        }
      }
    }
  }
  return out
}

/**
 * Walk a full DecodedTransactionData (main + nested calls) and return all
 * address-typed values.
 */
export function extractAddressesFromDecodedTransaction(
  decoded: DecodedTransactionData | null | undefined
): Address[] {
  if (!decoded) return []
  const out: Address[] = [...extractAddressesFromDecodedFunction(decoded.main)]
  if (decoded.nested) {
    for (const fn of decoded.nested) {
      out.push(...extractAddressesFromDecodedFunction(fn))
    }
  }
  return out
}
