/**
 * Security checks module
 *
 * Provides security analysis for Safe transactions including:
 * - Untrusted delegate call detection
 * - Gas token attack detection
 * - Owner/threshold modification detection
 * - Module enable/disable detection
 * - Guard modification detection
 */

// Main analyzer
export { analyzeSecurity } from './analyzer.js';

// Individual checkers
export { checkDelegateCall, isTrustedForDelegateCall, getOperationDescription, OperationType } from './delegate-call.js';
export { checkGasTokenAttack } from './gas-token.js';
export { checkOwnerModifications, checkOwnerModificationsFromDecoded, isOwnerModificationFunction } from './owner-checks.js';
export {
  checkModuleGuardOperations,
  checkModuleGuardOperationsFromDecoded,
  isModuleManagementFunction,
  isGuardManagementFunction,
} from './module-guard-checks.js';

// Utilities
export { decodeMultiSend, isMultiSend } from './multisend-decoder.js';
export type { DecodedMultiSendTransaction } from './multisend-decoder.js';

// Constants
export {
  MULTISEND_CALL_ONLY,
  SAFE_MIGRATION,
  SIGN_MESSAGE_LIB,
  TRUSTED_DELEGATE_CALL_ADDRESSES,
  OWNER_MODIFICATION_FUNCTIONS,
  MODULE_MANAGEMENT_FUNCTIONS,
  TRUSTED_MODULES,
  GUARD_MANAGEMENT_FUNCTIONS,
  TRUSTED_GUARDS,
  GUARD_STORAGE_SLOT,
  ZERO_ADDRESS,
} from './constants.js';

// Types
export type {
  WarningLevel,
  DelegateCallCheckResult,
  GasTokenCheckResult,
  OwnerModificationDetection,
  OwnerModificationCheckResult,
  ModuleGuardDetection,
  ModuleGuardCheckResult,
  SecurityAnalysisResult,
} from './types.js';
