/**
 * Safe Transaction Hash Calculation Module
 *
 * This module provides EIP-712 hash calculation for Safe multisig transactions,
 * matching the behavior of the original bash script.
 */

// Main calculator (primary export)
export { calculateSafeTxHash, verifySafeTxHash, type SafeTxHashResult } from './calculator.js';

// Component functions (for advanced usage)
export { calculateDomainHash } from './domain.js';
export { calculateMessageHash } from './message.js';

// Version utilities
export {
  getVersion,
  validateVersion,
  compareVersions,
  isVersionGte,
  isVersionLte,
  isVersionLt,
} from './version.js';

// Constants
export {
  DOMAIN_SEPARATOR_TYPEHASH,
  DOMAIN_SEPARATOR_TYPEHASH_OLD,
  SAFE_TX_TYPEHASH,
  SAFE_TX_TYPEHASH_OLD,
  SAFE_MSG_TYPEHASH,
  MIN_SAFE_VERSION,
} from './constants.js';
