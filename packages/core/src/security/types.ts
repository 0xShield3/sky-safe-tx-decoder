/**
 * Security check types and result interfaces
 */

import type { Address } from 'viem';

/**
 * Security warning severity levels
 */
export type WarningLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Result of delegate call security check
 */
export interface DelegateCallCheckResult {
  /**
   * Whether the transaction uses delegate call
   */
  isDelegateCall: boolean;

  /**
   * Whether the delegate call target is trusted
   */
  isTrusted: boolean;

  /**
   * Target address for the delegate call
   */
  targetAddress?: Address;

  /**
   * Warning message if applicable
   */
  warning?: string;

  /**
   * Warning severity level
   */
  warningLevel?: WarningLevel;
}

/**
 * Result of gas token attack check
 */
export interface GasTokenCheckResult {
  /**
   * Whether a custom gas token is used
   */
  usesCustomGasToken: boolean;

  /**
   * Whether a custom refund receiver is used
   */
  usesCustomRefundReceiver: boolean;

  /**
   * Whether gas price is non-zero
   */
  hasNonZeroGasPrice: boolean;

  /**
   * The gas token address (for reference)
   */
  gasToken: Address;

  /**
   * The refund receiver address (for reference)
   */
  refundReceiver: Address;

  /**
   * The gas price (for reference)
   */
  gasPrice: string;

  /**
   * Detected risk level
   */
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';

  /**
   * Warning messages
   */
  warnings: string[];

  /**
   * Warning severity level
   */
  warningLevel?: WarningLevel;
}

/**
 * Owner/threshold modification detected in transaction
 */
export interface OwnerModificationDetection {
  /**
   * Function name that modifies owners/threshold
   */
  functionName: string;

  /**
   * Whether this is a nested call (within MultiSend)
   */
  isNested: boolean;

  /**
   * Call depth (0 for direct, >0 for nested)
   */
  depth: number;
}

/**
 * Result of owner/threshold modification check
 */
export interface OwnerModificationCheckResult {
  /**
   * Whether the transaction modifies owners or threshold
   */
  modifiesOwners: boolean;

  /**
   * List of detected modifications
   */
  modifications: OwnerModificationDetection[];

  /**
   * Warning message
   */
  warning?: string;

  /**
   * Warning severity level
   */
  warningLevel: WarningLevel;
}

/**
 * Module or guard operation detected in transaction
 */
export interface ModuleGuardDetection {
  /**
   * Type of operation (module or guard)
   */
  type: 'module' | 'guard';

  /**
   * Function name (enableModule, disableModule, setGuard)
   */
  functionName: string;

  /**
   * Target address (module or guard address)
   */
  targetAddress?: Address;

  /**
   * Whether the target is a trusted module/guard
   */
  isTrusted: boolean;

  /**
   * Whether this is a nested call (within MultiSend)
   */
  isNested: boolean;

  /**
   * Call depth (0 for direct, >0 for nested)
   */
  depth: number;
}

/**
 * Result of module/guard operation check
 */
export interface ModuleGuardCheckResult {
  /**
   * Whether the transaction modifies modules
   */
  hasModuleOperation: boolean;

  /**
   * Whether the transaction modifies guards
   */
  hasGuardOperation: boolean;

  /**
   * List of detected operations
   */
  detections: ModuleGuardDetection[];

  /**
   * Warning messages
   */
  warnings?: string[];

  /**
   * Warning severity level
   */
  warningLevel: WarningLevel;
}

/**
 * Combined security analysis result
 */
export interface SecurityAnalysisResult {
  /**
   * Delegate call check result
   */
  delegateCall: DelegateCallCheckResult;

  /**
   * Gas token attack check result
   */
  gasToken: GasTokenCheckResult;

  /**
   * Owner/threshold modification check result
   */
  ownerModification: OwnerModificationCheckResult;

  /**
   * Module/guard operation check result
   */
  moduleGuard: ModuleGuardCheckResult;

  /**
   * Overall risk assessment
   */
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'none';

  /**
   * Whether the transaction should be flagged for careful review
   */
  requiresCarefulReview: boolean;
}
