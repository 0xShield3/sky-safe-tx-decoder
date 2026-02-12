/**
 * Gas Token Attack Detector
 *
 * Detects potential gas token attacks where custom gas tokens and refund receivers
 * can be used to hide value transfers through gas refunds.
 *
 * Reference: safe_hashes.sh lines 808-834
 */

import type { Address } from 'viem';
import { ZERO_ADDRESS } from './constants.js';
import type { GasTokenCheckResult } from './types.js';

/**
 * Check for potential gas token attack patterns
 *
 * A gas token attack occurs when a transaction uses:
 * 1. Custom gas token (not ETH/zero address)
 * 2. Custom refund receiver (not zero address)
 * 3. Optional: Non-zero gas price (increases attack potential)
 *
 * This combination can be used to hide value transfers through gas refunds.
 *
 * Reference: safe_hashes.sh lines 808-834
 *
 * @param gasPrice - The gas price for the transaction
 * @param gasToken - The gas token address (zero address = ETH)
 * @param refundReceiver - The refund receiver address (zero address = sender)
 * @returns Check result with risk level and warnings
 *
 * @example
 * // Critical risk: custom gas token + custom refund receiver + non-zero gas price
 * checkGasTokenAttack("1000000000", "0x1234...", "0x5678...")
 * // riskLevel: 'critical'
 *
 * // Medium risk: custom gas token + custom refund receiver (but zero gas price)
 * checkGasTokenAttack("0", "0x1234...", "0x5678...")
 * // riskLevel: 'medium'
 *
 * // Low risk: only custom gas token
 * checkGasTokenAttack("0", "0x1234...", "0x0000...")
 * // riskLevel: 'low'
 */
export function checkGasTokenAttack(
  gasPrice: bigint | string,
  gasToken: Address,
  refundReceiver: Address
): GasTokenCheckResult {
  const warnings: string[] = [];
  const gasPriceBigInt = typeof gasPrice === 'string' ? BigInt(gasPrice) : gasPrice;

  const usesCustomGasToken = gasToken.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const usesCustomRefundReceiver =
    refundReceiver.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const hasNonZeroGasPrice = gasPriceBigInt > 0n;

  // Critical risk: custom gas token + custom refund receiver
  if (usesCustomGasToken && usesCustomRefundReceiver) {
    warnings.push(
      'WARNING: This transaction uses a custom gas token and a custom refund receiver. ' +
        'This combination can be used to hide a rerouting of funds through gas refunds.'
    );

    if (hasNonZeroGasPrice) {
      warnings.push(
        'Furthermore, the gas price is non-zero, which increases the potential for hidden value transfers.'
      );

      return {
        usesCustomGasToken,
        usesCustomRefundReceiver,
        hasNonZeroGasPrice,
        gasToken,
        refundReceiver,
        gasPrice: typeof gasPrice === 'string' ? gasPrice : gasPrice.toString(),
        riskLevel: 'critical',
        warnings,
        warningLevel: 'critical',
      };
    }

    return {
      usesCustomGasToken,
      usesCustomRefundReceiver,
      hasNonZeroGasPrice,
      gasToken,
      refundReceiver,
      gasPrice: typeof gasPrice === 'string' ? gasPrice : gasPrice.toString(),
      riskLevel: 'high',
      warnings,
      warningLevel: 'high',
    };
  }

  // Medium risk: only custom gas token
  if (usesCustomGasToken) {
    warnings.push(
      'WARNING: This transaction uses a custom gas token. Please verify that this is intended.'
    );

    return {
      usesCustomGasToken,
      usesCustomRefundReceiver,
      hasNonZeroGasPrice,
      gasToken,
      refundReceiver,
      gasPrice: typeof gasPrice === 'string' ? gasPrice : gasPrice.toString(),
      riskLevel: 'medium',
      warnings,
      warningLevel: 'medium',
    };
  }

  // Low risk: only custom refund receiver
  if (usesCustomRefundReceiver) {
    warnings.push(
      'WARNING: This transaction uses a custom refund receiver. Please verify that this is intended.'
    );

    return {
      usesCustomGasToken,
      usesCustomRefundReceiver,
      hasNonZeroGasPrice,
      gasToken,
      refundReceiver,
      gasPrice: typeof gasPrice === 'string' ? gasPrice : gasPrice.toString(),
      riskLevel: 'low',
      warnings,
      warningLevel: 'low',
    };
  }

  // No risk detected
  return {
    usesCustomGasToken,
    usesCustomRefundReceiver,
    hasNonZeroGasPrice,
    gasToken,
    refundReceiver,
    gasPrice: typeof gasPrice === 'string' ? gasPrice : gasPrice.toString(),
    riskLevel: 'none',
    warnings,
  };
}
