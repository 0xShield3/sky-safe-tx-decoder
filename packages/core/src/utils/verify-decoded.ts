/**
 * Utilities for verifying Safe API decoded data against raw transaction data
 *
 * This ensures we don't blindly trust the API's decoded data - we verify it
 * by re-encoding and comparing to the raw data.
 */

import { encodeFunctionData, parseAbiParameters, type Hex } from 'viem';
import type { SafeApiDataDecoded } from '../types.js';

/**
 * Result of verifying decoded data
 */
export interface DecodeVerificationResult {
  /** Whether the decoded data matches the raw data */
  verified: boolean;
  /** Error message if verification failed */
  error?: string;
  /** Re-encoded data (for debugging) */
  reencoded?: Hex;
}

/**
 * Verify that Safe API's decoded data matches the raw transaction data
 *
 * @param rawData - Raw transaction data (0x...)
 * @param decoded - Decoded data from Safe API
 * @returns Verification result
 *
 * @example
 * const result = verifyDecodedData(tx.data, tx.dataDecoded);
 * if (result.verified) {
 *   console.log('✅ Decoded data verified');
 * } else {
 *   console.warn('⚠️ Decoded data mismatch:', result.error);
 * }
 */
export function verifyDecodedData(
  rawData: Hex | null,
  decoded: SafeApiDataDecoded | null
): DecodeVerificationResult {
  // If no decoded data provided, we can't verify
  if (!decoded) {
    return {
      verified: false,
      error: 'No decoded data provided',
    };
  }

  // If no raw data, can't verify
  if (!rawData || rawData === '0x') {
    return {
      verified: false,
      error: 'No raw data to verify against',
    };
  }

  try {
    // Extract function selector (first 4 bytes = 8 hex chars + 0x)
    const functionSelector = rawData.slice(0, 10) as Hex;

    // Build ABI from decoded data
    const parameters = decoded.parameters.map(param => ({
      name: param.name,
      type: param.type,
    }));

    // If no parameters, just check if selector matches a zero-param function
    if (parameters.length === 0) {
      // For zero-parameter functions, raw data should just be the selector
      const verified = rawData === functionSelector;
      return {
        verified,
        error: verified ? undefined : 'Raw data has extra bytes beyond function selector',
        reencoded: functionSelector,
      };
    }

    // Parse parameter types
    const abiParameters = parseAbiParameters(
      parameters.map(p => `${p.type} ${p.name}`).join(', ')
    );

    // Convert parameter values to proper types
    const args = decoded.parameters.map(param => {
      // Handle different types
      if (param.type === 'address' || param.type === 'address[]') {
        return param.value;
      } else if (param.type.startsWith('uint') || param.type.startsWith('int')) {
        return BigInt(param.value);
      } else if (param.type === 'bool') {
        const strValue = String(param.value).toLowerCase();
        return strValue === 'true';
      } else if (param.type === 'bytes' || param.type.startsWith('bytes')) {
        return param.value as Hex;
      } else if (param.type.endsWith('[]')) {
        // Array type - try to parse the value
        try {
          const parsed = typeof param.value === 'string' ? JSON.parse(param.value) : param.value;
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return param.value;
        }
      } else {
        return param.value;
      }
    });

    // Re-encode the function call
    const reencoded = encodeFunctionData({
      abi: [{
        name: decoded.method,
        type: 'function',
        inputs: abiParameters,
      }],
      functionName: decoded.method,
      args,
    });

    // Compare re-encoded data with raw data
    const verified = reencoded.toLowerCase() === rawData.toLowerCase();

    return {
      verified,
      error: verified ? undefined : 'Re-encoded data does not match raw data',
      reencoded,
    };
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify multiple nested transactions (e.g., from MultiSend)
 *
 * @param nestedTxs - Array of nested transactions with raw data and decoded data
 * @returns Array of verification results
 */
export function verifyNestedTransactions(
  nestedTxs: Array<{ data: Hex; decoded: SafeApiDataDecoded | null }>
): DecodeVerificationResult[] {
  return nestedTxs.map(tx => verifyDecodedData(tx.data, tx.decoded));
}
