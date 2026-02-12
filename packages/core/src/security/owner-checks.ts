/**
 * Owner and Threshold Modification Detector
 *
 * Detects transactions that modify Safe owners or threshold, including
 * nested calls within MultiSend transactions.
 *
 * Reference: safe_hashes.sh lines 525-548
 */

import type { Hex } from 'viem';
import { toFunctionSelector } from 'viem';
import { OWNER_MODIFICATION_FUNCTIONS } from './constants.js';
import type {
  OwnerModificationCheckResult,
  OwnerModificationDetection,
} from './types.js';
import { decodeMultiSend } from './multisend-decoder.js';

/**
 * Generate function selectors for owner modification functions
 */
const OWNER_MODIFICATION_SELECTORS = new Map<Hex, string>([
  [toFunctionSelector('addOwnerWithThreshold(address,uint256)'), 'addOwnerWithThreshold'],
  [toFunctionSelector('removeOwner(address,address,uint256)'), 'removeOwner'],
  [toFunctionSelector('swapOwner(address,address,address)'), 'swapOwner'],
  [toFunctionSelector('changeThreshold(uint256)'), 'changeThreshold'],
]);

/**
 * Extract function selector from transaction data
 */
function getFunctionSelector(data: Hex): Hex | null {
  if (!data || data === '0x' || data.length < 10) {
    return null;
  }
  return data.slice(0, 10) as Hex;
}

/**
 * Check if a function name is an owner/threshold modification function
 *
 * @param functionName - The function name to check
 * @returns True if the function modifies owners or threshold
 */
export function isOwnerModificationFunction(functionName: string): boolean {
  return OWNER_MODIFICATION_FUNCTIONS.includes(
    functionName as (typeof OWNER_MODIFICATION_FUNCTIONS)[number]
  );
}


/**
 * Try to decode transaction data and check for owner modification functions
 *
 * @param data - Transaction data
 * @param depth - Call depth (0 for direct, >0 for nested)
 * @returns List of detected modifications
 */
function checkTransactionData(
  data: Hex,
  depth: number = 0
): OwnerModificationDetection[] {
  const modifications: OwnerModificationDetection[] = [];

  if (!data || data === '0x') {
    return modifications;
  }

  // Check if this is an owner modification function by selector
  const selector = getFunctionSelector(data);
  if (selector) {
    const functionName = OWNER_MODIFICATION_SELECTORS.get(selector);
    if (functionName) {
      modifications.push({
        functionName,
        isNested: depth > 0,
        depth,
      });
      return modifications; // Found a match, no need to check further
    }
  }

  // Try to decode as MultiSend to check nested transactions
  const multiSendTxs = decodeMultiSend(data);
  if (multiSendTxs) {
    for (const tx of multiSendTxs) {
      // Recursively check each nested transaction
      const nestedModifications = checkTransactionData(tx.data, depth + 1);
      modifications.push(...nestedModifications);
    }
  }

  return modifications;
}

/**
 * Check if transaction data contains owner or threshold modifications
 *
 * Checks both direct calls and nested calls within MultiSend transactions.
 *
 * Reference: safe_hashes.sh lines 525-548
 *
 * @param data - Transaction data to check
 * @returns Check result with list of detected modifications
 *
 * @example
 * // Direct owner modification
 * const result = checkOwnerModifications("0x0d582f13..."); // addOwnerWithThreshold data
 * // result.modifiesOwners = true
 * // result.modifications[0].functionName = "addOwnerWithThreshold"
 * // result.modifications[0].isNested = false
 *
 * // Nested within MultiSend
 * const result = checkOwnerModifications("0x8d80ff0a..."); // multiSend containing removeOwner
 * // result.modifiesOwners = true
 * // result.modifications[0].functionName = "removeOwner"
 * // result.modifications[0].isNested = true
 */
export function checkOwnerModifications(data: Hex): OwnerModificationCheckResult {
  const modifications = checkTransactionData(data, 0);

  if (modifications.length === 0) {
    return {
      modifiesOwners: false,
      modifications: [],
      warningLevel: 'info',
    };
  }

  // Build warning message
  const functionNames = modifications.map((m) => m.functionName).join(', ');
  const warning = `WARNING: This transaction modifies the owners or threshold of the Safe! Functions: ${functionNames}. Proceed with caution!`;

  return {
    modifiesOwners: true,
    modifications,
    warning,
    warningLevel: 'critical',
  };
}

/**
 * Check if decoded transaction data (from Safe API) contains owner modifications
 *
 * This is a simpler check that works with already-decoded data from the Safe API.
 *
 * @param method - The decoded method name
 * @param parameters - The decoded parameters (optional, for checking nested calls)
 * @returns Check result
 */
export function checkOwnerModificationsFromDecoded(
  method: string,
  parameters?: Array<{ name: string; type: string; value: string | string[] }>
): OwnerModificationCheckResult {
  const modifications: OwnerModificationDetection[] = [];

  // Check direct call
  if (isOwnerModificationFunction(method)) {
    modifications.push({
      functionName: method,
      isNested: false,
      depth: 0,
    });
  }

  // Check nested calls (in MultiSend)
  if (method === 'multiSend' && parameters) {
    const dataParam = parameters.find((p) => p.name === 'data' || p.type === 'bytes[]');
    if (dataParam && Array.isArray(dataParam.value)) {
      // Each item in the array could contain an owner modification function
      for (const nestedData of dataParam.value) {
        if (typeof nestedData === 'string') {
          const nestedMods = checkTransactionData(nestedData as Hex, 1);
          modifications.push(...nestedMods);
        }
      }
    }
  }

  if (modifications.length === 0) {
    return {
      modifiesOwners: false,
      modifications: [],
      warningLevel: 'info',
    };
  }

  const functionNames = modifications.map((m) => m.functionName).join(', ');
  const warning = `WARNING: This transaction modifies the owners or threshold of the Safe! Functions: ${functionNames}. Proceed with caution!`;

  return {
    modifiesOwners: true,
    modifications,
    warning,
    warningLevel: 'critical',
  };
}
