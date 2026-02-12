/**
 * Trusted Contract Addresses for Safe Delegate Calls
 *
 * These addresses are considered safe for delegate call operations.
 * Reference: safe_hashes.sh lines 182-230
 *
 * @see https://github.com/safe-global/safe-transaction-service/blob/0e6da1d19cec56f8e2834e6159f2d25733c64843/safe_transaction_service/contracts/management/commands/setup_safe_contracts.py#L15-L19
 */

import type { Address } from 'viem';

/**
 * MultiSendCallOnly addresses (trusted for batch transactions)
 * Reference: safe_hashes.sh lines 182-196
 */
export const MULTISEND_CALL_ONLY: readonly Address[] = [
  '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D', // v1.3.0 (canonical)
  '0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B', // v1.3.0 (eip155)
  '0xf220D3b4DFb23C4ade8C88E526C1353AbAcbC38F', // v1.3.0 (zksync)
  '0x9641d764fc13c8B624c04430C7356C1C7C8102e2', // v1.4.1 (canonical)
  '0x0408EF011960d02349d50286D20531229BCef773', // v1.4.1 (zksync)
  '0xA83c336B20401Af773B6219BA5027174338D1836', // v1.5.0 (canonical)
] as const;

/**
 * SafeMigration addresses (trusted for Safe contract migrations)
 * Reference: safe_hashes.sh lines 198-206
 */
export const SAFE_MIGRATION: readonly Address[] = [
  '0x526643F69b81B008F46d95CD5ced5eC0edFFDaC6', // v1.4.1 (canonical)
  '0x817756C6c555A94BCEE39eB5a102AbC1678b09A7', // v1.4.1 (zksync)
  '0x6439e7ABD8Bb915A5263094784C5CF561c4172AC', // v1.5.0 (canonical)
] as const;

/**
 * SignMessageLib addresses (trusted for off-chain message signing)
 * Reference: safe_hashes.sh lines 208-222
 */
export const SIGN_MESSAGE_LIB: readonly Address[] = [
  '0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2', // v1.3.0 (canonical)
  '0x98FFBBF51bb33A056B08ddf711f289936AafF717', // v1.3.0 (eip155)
  '0x357147caf9C0cCa67DfA0CF5369318d8193c8407', // v1.3.0 (zksync)
  '0xd53cd0aB83D845Ac265BE939c57F53AD838012c9', // v1.4.1 (canonical)
  '0xAca1ec0a1A575CDCCF1DC3d5d296202Eb6061888', // v1.4.1 (zksync)
  '0x4FfeF8222648872B3dE295Ba1e49110E61f5b5aa', // v1.5.0 (canonical)
] as const;

/**
 * All trusted addresses for delegate calls
 */
export const TRUSTED_DELEGATE_CALL_ADDRESSES: readonly Address[] = [
  ...MULTISEND_CALL_ONLY,
  ...SAFE_MIGRATION,
  ...SIGN_MESSAGE_LIB,
] as const;

/**
 * Safe function signatures that modify owners or threshold
 * Reference: safe_hashes.sh lines 528, 545
 */
export const OWNER_MODIFICATION_FUNCTIONS = [
  'addOwnerWithThreshold',
  'removeOwner',
  'swapOwner',
  'changeThreshold',
] as const;

/**
 * Module management function names
 *
 * WARNING: Modules are a security risk since they can execute arbitrary transactions
 * with unlimited access to the Safe, bypassing signature requirements.
 */
export const MODULE_MANAGEMENT_FUNCTIONS = [
  'enableModule',
  'disableModule',
] as const;

/**
 * Trusted modules (currently only Allowance Module on mainnet)
 *
 * Even trusted modules should trigger warnings due to their significant risk.
 * Modules can bypass signatures and execute transactions directly.
 *
 * @see https://github.com/safe-global/safe-modules/tree/main/modules/allowances
 */
export const TRUSTED_MODULES: readonly Address[] = [
  '0xcfbfac74c26f8647cbdb8c5caf80bb5b32e43134', // Allowance Module (mainnet) - sets spending limits
] as const;

/**
 * Guard management function names
 *
 * WARNING: Guards can block transaction execution, and improperly configured
 * guards can cause denial of service (brick the Safe).
 */
export const GUARD_MANAGEMENT_FUNCTIONS = [
  'setGuard',
] as const;

/**
 * Trusted guards
 *
 * Currently empty - will be populated as trusted guards are identified.
 * All guard operations should trigger warnings due to DoS risk.
 */
export const TRUSTED_GUARDS: readonly Address[] = [] as const;

/**
 * Storage slot for guard address
 * keccak256("guard_manager.guard.address")
 */
export const GUARD_STORAGE_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8' as const;

/**
 * Zero address constant
 */
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';
