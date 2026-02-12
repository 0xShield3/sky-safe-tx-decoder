/**
 * Security Analyzer - Combines all security checks
 */

import { checkDelegateCall } from './delegate-call.js';
import { checkGasTokenAttack } from './gas-token.js';
import { checkOwnerModifications } from './owner-checks.js';
import { checkModuleGuardOperations } from './module-guard-checks.js';
import type { SecurityAnalysisResult } from './types.js';
import type { SafeTransactionData } from '../types.js';

/**
 * Perform comprehensive security analysis on a Safe transaction
 *
 * Combines all security checks:
 * 1. Delegate call detection (trusted vs untrusted)
 * 2. Gas token attack detection
 * 3. Owner/threshold modification detection
 * 4. Module enable/disable detection
 * 5. Guard modification detection
 *
 * @param txData - Safe transaction data
 * @returns Complete security analysis result
 *
 * @example
 * const analysis = analyzeSecurity({
 *   to: "0x1234...",
 *   value: "0",
 *   data: "0x...",
 *   operation: 1, // DelegateCall
 *   safeTxGas: "0",
 *   baseGas: "0",
 *   gasPrice: "1000000000",
 *   gasToken: "0x5678...", // Custom gas token
 *   refundReceiver: "0x9abc...", // Custom refund receiver
 *   nonce: "1"
 * });
 *
 * if (analysis.overallRisk === 'critical') {
 *   console.error('DO NOT SIGN THIS TRANSACTION!');
 * }
 */
export function analyzeSecurity(txData: SafeTransactionData): SecurityAnalysisResult {
  // Check for untrusted delegate calls
  const delegateCall = checkDelegateCall(txData.operation, txData.to);

  // Check for gas token attacks
  const gasToken = checkGasTokenAttack(
    txData.gasPrice,
    txData.gasToken,
    txData.refundReceiver
  );

  // Check for owner/threshold modifications
  const ownerModification = checkOwnerModifications(txData.data);

  // Check for module/guard operations
  const moduleGuard = checkModuleGuardOperations(txData.data);

  // Determine overall risk level (highest of all checks)
  let overallRisk: SecurityAnalysisResult['overallRisk'] = 'none';

  if (
    delegateCall.warningLevel === 'critical' ||
    gasToken.riskLevel === 'critical' ||
    ownerModification.warningLevel === 'critical' ||
    moduleGuard.warningLevel === 'critical'
  ) {
    overallRisk = 'critical';
  } else if (
    delegateCall.warningLevel === 'high' ||
    gasToken.riskLevel === 'high' ||
    ownerModification.warningLevel === 'high' ||
    moduleGuard.warningLevel === 'high'
  ) {
    overallRisk = 'high';
  } else if (
    delegateCall.warningLevel === 'medium' ||
    gasToken.riskLevel === 'medium' ||
    ownerModification.warningLevel === 'medium' ||
    moduleGuard.warningLevel === 'medium'
  ) {
    overallRisk = 'medium';
  } else if (
    delegateCall.warningLevel === 'low' ||
    gasToken.riskLevel === 'low' ||
    ownerModification.warningLevel === 'low' ||
    moduleGuard.warningLevel === 'low'
  ) {
    overallRisk = 'low';
  }

  // Flag for careful review if any significant risk detected
  const requiresCarefulReview =
    overallRisk === 'critical' ||
    overallRisk === 'high' ||
    delegateCall.warningLevel !== undefined ||
    gasToken.warnings.length > 0 ||
    ownerModification.modifiesOwners ||
    moduleGuard.hasModuleOperation ||
    moduleGuard.hasGuardOperation;

  return {
    delegateCall,
    gasToken,
    ownerModification,
    moduleGuard,
    overallRisk,
    requiresCarefulReview,
  };
}
