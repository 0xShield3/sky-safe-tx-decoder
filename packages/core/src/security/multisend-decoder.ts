/**
 * MultiSend Transaction Decoder
 *
 * Utilities for decoding MultiSend packed transactions
 */

import type { Hex } from 'viem';
import { decodeFunctionData } from 'viem';

/**
 * MultiSend ABI for decoding
 */
const MULTISEND_ABI = [
  {
    name: 'multiSend',
    type: 'function',
    inputs: [{ name: 'transactions', type: 'bytes' }],
  },
] as const;

/**
 * Decoded transaction from MultiSend
 */
export interface DecodedMultiSendTransaction {
  operation: number;
  to: string;
  value: bigint;
  data: Hex;
}

/**
 * Decode MultiSend packed transactions
 *
 * MultiSend packs transactions as:
 * [uint8 operation][address to][uint256 value][uint256 dataLength][bytes data]
 *
 * @param data - Transaction data (should be a multiSend call)
 * @returns Array of decoded transactions, or null if not a MultiSend
 *
 * @example
 * const transactions = decodeMultiSend(data);
 * if (transactions) {
 *   for (const tx of transactions) {
 *     console.log(`Call to ${tx.to} with data ${tx.data}`);
 *   }
 * }
 */
export function decodeMultiSend(data: Hex): DecodedMultiSendTransaction[] | null {
  try {
    const decoded = decodeFunctionData({
      abi: MULTISEND_ABI,
      data,
    });

    if (decoded.functionName !== 'multiSend' || !decoded.args) {
      return null;
    }

    const transactions: DecodedMultiSendTransaction[] = [];
    const packedData = decoded.args[0] as Hex;
    let offset = 2; // Skip '0x'

    while (offset < packedData.length) {
      // Read operation (1 byte = 2 hex chars)
      const operation = parseInt(packedData.slice(offset, offset + 2), 16);
      offset += 2;

      // Read to address (20 bytes = 40 hex chars)
      const to = '0x' + packedData.slice(offset, offset + 40);
      offset += 40;

      // Read value (32 bytes = 64 hex chars)
      const valueHex = packedData.slice(offset, offset + 64);
      const value = BigInt('0x' + valueHex);
      offset += 64;

      // Read data length (32 bytes = 64 hex chars)
      const dataLengthHex = packedData.slice(offset, offset + 64);
      const dataLength = parseInt(dataLengthHex, 16);
      offset += 64;

      // Read data (dataLength bytes = dataLength * 2 hex chars)
      const txData = ('0x' + packedData.slice(offset, offset + dataLength * 2)) as Hex;
      offset += dataLength * 2;

      transactions.push({
        operation,
        to,
        value,
        data: txData,
      });
    }

    return transactions;
  } catch {
    // Not a MultiSend or parsing failed
    return null;
  }
}

/**
 * Check if transaction data is a MultiSend call
 *
 * @param data - Transaction data to check
 * @returns True if data is a multiSend call
 */
export function isMultiSend(data: Hex): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: MULTISEND_ABI,
      data,
    });
    return decoded.functionName === 'multiSend';
  } catch {
    return false;
  }
}
