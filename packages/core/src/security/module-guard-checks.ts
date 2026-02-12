/**
 * Module and Guard Management Detector
 *
 * Detects transactions that enable/disable modules or set guards.
 * Both operations are high-risk and should trigger warnings.
 */

import type { Hex, Address } from 'viem';
import { toFunctionSelector, decodeFunctionData } from 'viem';
import {
  MODULE_MANAGEMENT_FUNCTIONS,
  GUARD_MANAGEMENT_FUNCTIONS,
  TRUSTED_MODULES,
  TRUSTED_GUARDS,
} from './constants.js';
import type { ModuleGuardCheckResult, ModuleGuardDetection } from './types.js';
import { decodeMultiSend } from './multisend-decoder.js';

/**
 * Generate function selectors for module management functions
 */
const MODULE_SELECTORS = new Map<Hex, string>([
  [toFunctionSelector('enableModule(address)'), 'enableModule'],
  [toFunctionSelector('disableModule(address,address)'), 'disableModule'],
]);

/**
 * Generate function selectors for guard management functions
 */
const GUARD_SELECTORS = new Map<Hex, string>([
  [toFunctionSelector('setGuard(address)'), 'setGuard'],
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
 * Check if an address is a trusted module
 */
function isTrustedModule(address: Address): boolean {
  const normalizedAddress = address.toLowerCase() as Address;
  return TRUSTED_MODULES.some(
    (trusted) => trusted.toLowerCase() === normalizedAddress
  );
}

/**
 * Check if an address is a trusted guard
 */
function isTrustedGuard(address: Address): boolean {
  const normalizedAddress = address.toLowerCase() as Address;
  return TRUSTED_GUARDS.some(
    (trusted) => trusted.toLowerCase() === normalizedAddress
  );
}

/**
 * Check if a function name is a module management function
 */
export function isModuleManagementFunction(functionName: string): boolean {
  return MODULE_MANAGEMENT_FUNCTIONS.includes(
    functionName as (typeof MODULE_MANAGEMENT_FUNCTIONS)[number]
  );
}

/**
 * Check if a function name is a guard management function
 */
export function isGuardManagementFunction(functionName: string): boolean {
  return GUARD_MANAGEMENT_FUNCTIONS.includes(
    functionName as (typeof GUARD_MANAGEMENT_FUNCTIONS)[number]
  );
}

/**
 * Try to decode transaction data and check for module/guard management
 */
function checkTransactionData(
  data: Hex,
  depth: number = 0
): ModuleGuardDetection[] {
  const detections: ModuleGuardDetection[] = [];

  if (!data || data === '0x') {
    return detections;
  }

  // Check for module management functions
  const selector = getFunctionSelector(data);
  if (selector) {
    const moduleFunctionName = MODULE_SELECTORS.get(selector);
    if (moduleFunctionName) {
      // Try to extract the module address from the data
      try {
        const decoded = decodeFunctionData({
          abi: [
            moduleFunctionName === 'enableModule'
              ? 'function enableModule(address module)'
              : 'function disableModule(address prevModule, address module)',
          ],
          data,
        });

        if (!decoded.args || decoded.args.length === 0) {
          throw new Error('Failed to decode module address');
        }

        const moduleAddress =
          moduleFunctionName === 'enableModule'
            ? (decoded.args[0] as Address)
            : (decoded.args[1] as Address); // For disableModule, second arg is the module

        const isTrusted = isTrustedModule(moduleAddress);

        detections.push({
          type: 'module',
          functionName: moduleFunctionName,
          targetAddress: moduleAddress,
          isTrusted,
          isNested: depth > 0,
          depth,
        });
      } catch {
        // If decode fails, still warn but without address details
        detections.push({
          type: 'module',
          functionName: moduleFunctionName,
          isTrusted: false,
          isNested: depth > 0,
          depth,
        });
      }
      return detections;
    }

    // Check for guard management functions
    const guardFunctionName = GUARD_SELECTORS.get(selector);
    if (guardFunctionName) {
      // Try to extract the guard address
      try {
        const decoded = decodeFunctionData({
          abi: ['function setGuard(address guard)'],
          data,
        });

        if (!decoded.args || decoded.args.length === 0) {
          throw new Error('Failed to decode guard address');
        }

        const guardAddress = decoded.args[0] as Address;
        const isTrusted = isTrustedGuard(guardAddress);

        detections.push({
          type: 'guard',
          functionName: guardFunctionName,
          targetAddress: guardAddress,
          isTrusted,
          isNested: depth > 0,
          depth,
        });
      } catch {
        // If decode fails, still warn
        detections.push({
          type: 'guard',
          functionName: guardFunctionName,
          isTrusted: false,
          isNested: depth > 0,
          depth,
        });
      }
      return detections;
    }
  }

  // Try to decode as MultiSend to check nested transactions
  const multiSendTxs = decodeMultiSend(data);
  if (multiSendTxs) {
    for (const tx of multiSendTxs) {
      // Recursively check each nested transaction
      const nestedDetections = checkTransactionData(tx.data, depth + 1);
      detections.push(...nestedDetections);
    }
  }

  return detections;
}

/**
 * Check if transaction data contains module or guard management operations
 *
 * WARNING: Both modules and guards are high-risk operations:
 * - Modules can bypass signatures and execute arbitrary transactions
 * - Guards can block execution and cause denial of service
 *
 * @param data - Transaction data to check
 * @returns Check result with list of detected operations
 *
 * @example
 * // Enable a module
 * const result = checkModuleGuardOperations("0x610b5925..."); // enableModule data
 * // result.hasModuleOperation = true
 * // result.detections[0].type = "module"
 * // result.detections[0].functionName = "enableModule"
 *
 * // Set a guard
 * const result = checkModuleGuardOperations("0x5e5a6775..."); // setGuard data
 * // result.hasGuardOperation = true
 * // result.detections[0].type = "guard"
 */
export function checkModuleGuardOperations(data: Hex): ModuleGuardCheckResult {
  const detections = checkTransactionData(data, 0);

  if (detections.length === 0) {
    return {
      hasModuleOperation: false,
      hasGuardOperation: false,
      detections: [],
      warningLevel: 'info',
    };
  }

  // Determine overall warning level and build warning message
  const moduleOps = detections.filter((d) => d.type === 'module');
  const guardOps = detections.filter((d) => d.type === 'guard');

  const warnings: string[] = [];

  if (moduleOps.length > 0) {
    const trustedCount = moduleOps.filter((op) => op.isTrusted).length;
    const untrustedCount = moduleOps.length - trustedCount;

    const functionNames = moduleOps.map((op) => op.functionName).join(', ');

    if (untrustedCount > 0) {
      warnings.push(
        `WARNING: This transaction modifies Safe modules (${functionNames})! ` +
          `Modules have unlimited access to the Safe and can execute arbitrary transactions, bypassing signature requirements. ` +
          `This is a significant security risk.`
      );
    } else if (trustedCount > 0) {
      warnings.push(
        `WARNING: This transaction modifies Safe modules (${functionNames})! ` +
          `Even though this involves a trusted module, modules have significant power and risk. ` +
          `Verify the module address and ensure this change is intended.`
      );
    }
  }

  if (guardOps.length > 0) {
    const functionNames = guardOps.map((op) => op.functionName).join(', ');
    warnings.push(
      `WARNING: This transaction modifies the Safe guard (${functionNames})! ` +
        `Guards can block transaction execution. An improperly configured guard can cause denial of service, ` +
        `effectively bricking the Safe. Proceed with extreme caution!`
    );
  }

  return {
    hasModuleOperation: moduleOps.length > 0,
    hasGuardOperation: guardOps.length > 0,
    detections,
    warnings,
    warningLevel: 'high', // Always high risk for module/guard operations
  };
}

/**
 * Check if decoded transaction data (from Safe API) contains module/guard operations
 *
 * @param method - The decoded method name
 * @returns Check result
 */
export function checkModuleGuardOperationsFromDecoded(
  method: string
): ModuleGuardCheckResult {
  const detections: ModuleGuardDetection[] = [];

  if (isModuleManagementFunction(method)) {
    detections.push({
      type: 'module',
      functionName: method,
      isTrusted: false, // Don't know the address from just the method name
      isNested: false,
      depth: 0,
    });
  }

  if (isGuardManagementFunction(method)) {
    detections.push({
      type: 'guard',
      functionName: method,
      isTrusted: false,
      isNested: false,
      depth: 0,
    });
  }

  if (detections.length === 0) {
    return {
      hasModuleOperation: false,
      hasGuardOperation: false,
      detections: [],
      warningLevel: 'info',
    };
  }

  const warnings: string[] = [];

  if (detections.some((d) => d.type === 'module')) {
    warnings.push(
      `WARNING: This transaction modifies Safe modules! Modules have unlimited access and can bypass signatures.`
    );
  }

  if (detections.some((d) => d.type === 'guard')) {
    warnings.push(
      `WARNING: This transaction modifies the Safe guard! Improperly configured guards can brick the Safe.`
    );
  }

  return {
    hasModuleOperation: detections.some((d) => d.type === 'module'),
    hasGuardOperation: detections.some((d) => d.type === 'guard'),
    detections,
    warnings,
    warningLevel: 'high',
  };
}
