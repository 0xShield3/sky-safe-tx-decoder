/**
 * Delegate Call Security Checker
 *
 * Reference: safe_hashes.sh lines 789-806
 */

import type { Address } from 'viem';
import { TRUSTED_DELEGATE_CALL_ADDRESSES } from './constants.js';
import type { DelegateCallCheckResult } from './types.js';

/**
 * Operation type constants matching Safe's Enum.Operation
 * @see https://github.com/safe-global/safe-smart-account/blob/34359e8305d618b7d74e39ed370a6b59ab14f827/contracts/libraries/Enum.sol
 */
export const OperationType = {
  Call: 0,
  DelegateCall: 1,
} as const;

/**
 * Check if an address is trusted for delegate calls
 *
 * @param address - The address to check
 * @returns True if the address is in the trusted list
 */
export function isTrustedForDelegateCall(address: Address): boolean {
  const normalizedAddress = address.toLowerCase() as Address;
  return TRUSTED_DELEGATE_CALL_ADDRESSES.some(
    (trusted) => trusted.toLowerCase() === normalizedAddress
  );
}

/**
 * Check if a transaction uses an untrusted delegate call
 *
 * Warns the user if operation equals 1 (delegate call) and the target address
 * is not in the trusted contracts list.
 *
 * Reference: safe_hashes.sh lines 789-806
 *
 * @param operation - The operation type (0 = Call, 1 = DelegateCall)
 * @param to - The target address
 * @returns Check result with warning if delegate call is untrusted
 *
 * @example
 * // Trusted delegate call (MultiSendCallOnly)
 * const result = checkDelegateCall(1, "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D");
 * // result.isTrusted = true, no warning
 *
 * // Untrusted delegate call
 * const result = checkDelegateCall(1, "0x1234567890123456789012345678901234567890");
 * // result.isTrusted = false, warning present
 */
export function checkDelegateCall(
  operation: number,
  to: Address
): DelegateCallCheckResult {
  const isDelegateCall = operation === OperationType.DelegateCall;

  if (!isDelegateCall) {
    return {
      isDelegateCall: false,
      isTrusted: false,
    };
  }

  const isTrusted = isTrustedForDelegateCall(to);

  if (isTrusted) {
    return {
      isDelegateCall: true,
      isTrusted: true,
      targetAddress: to,
    };
  }

  // Untrusted delegate call detected
  return {
    isDelegateCall: true,
    isTrusted: false,
    targetAddress: to,
    warning: `WARNING: The transaction includes an untrusted delegate call to address ${to}! This may lead to unexpected behaviour or vulnerabilities. Please review it carefully before you sign!`,
    warningLevel: 'critical',
  };
}

/**
 * Get a human-readable description of the operation type
 *
 * @param operation - The operation type
 * @param to - The target address (used to check if delegate call is trusted)
 * @returns Formatted operation description
 */
export function getOperationDescription(operation: number, to: Address): string {
  if (operation === OperationType.Call) {
    return 'Call';
  }

  if (operation === OperationType.DelegateCall) {
    const isTrusted = isTrustedForDelegateCall(to);
    return isTrusted
      ? 'DelegateCall (trusted)'
      : 'DelegateCall (UNTRUSTED - carefully verify before proceeding!)';
  }

  return 'Unknown';
}
