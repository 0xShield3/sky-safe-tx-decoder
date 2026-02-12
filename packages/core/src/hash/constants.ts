/**
 * EIP-712 Type Hash Constants for Safe Multisig
 *
 * Reference: safe_hashes.sh lines 157-172
 */

/**
 * Current domain separator type hash (with chainId).
 * `keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")`
 * Used in Safe versions >= 1.3.0
 *
 * @see https://github.com/safe-global/safe-smart-account/blob/a0a1d4292006e26c4dbd52282f4c932e1ffca40f/contracts/Safe.sol#L54-L57
 * @see https://github.com/safe-global/safe-smart-account/pull/264
 */
export const DOMAIN_SEPARATOR_TYPEHASH = '0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218' as const;

/**
 * Legacy domain separator type hash (without chainId).
 * `keccak256("EIP712Domain(address verifyingContract)")`
 * Used in Safe versions <= 1.2.0
 *
 * @see https://github.com/safe-global/safe-smart-account/blob/703dde2ea9882a35762146844d5cfbeeec73e36f/contracts/GnosisSafe.sol#L20-L23
 */
export const DOMAIN_SEPARATOR_TYPEHASH_OLD = '0x035aff83d86937d35b32e04f0ddc6ff469290eef2f1b692d8a815c89404d4749' as const;

/**
 * Current Safe transaction type hash (with baseGas).
 * `keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")`
 * Used in Safe versions >= 1.0.0
 *
 * @see https://github.com/safe-global/safe-smart-account/blob/a0a1d4292006e26c4dbd52282f4c932e1ffca40f/contracts/Safe.sol#L59-L62
 * @see https://github.com/safe-global/safe-smart-account/pull/90
 */
export const SAFE_TX_TYPEHASH = '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8' as const;

/**
 * Legacy Safe transaction type hash (with dataGas).
 * `keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 dataGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")`
 * Used in Safe versions < 1.0.0
 *
 * @see https://github.com/safe-global/safe-smart-account/blob/427d6f7e779431333c54bcb4d4cde31e4d57ce96/contracts/GnosisSafe.sol#L25-L28
 */
export const SAFE_TX_TYPEHASH_OLD = '0x14d461bc7412367e924637b363c7bf29b8f47e2f84869f4426e5633d8af47b20' as const;

/**
 * Safe message type hash for off-chain message signing.
 * `keccak256("SafeMessage(bytes message)")`
 *
 * @see https://github.com/safe-global/safe-smart-account/blob/febab5e4e859e6e65914f17efddee415e4992961/contracts/libraries/SignMessageLib.sol#L12-L13
 */
export const SAFE_MSG_TYPEHASH = '0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca' as const;

/**
 * Minimum supported Safe version.
 */
export const MIN_SAFE_VERSION = '0.1.0' as const;
