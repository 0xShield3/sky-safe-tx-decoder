/**
 * Output formatting utilities for CLI
 * Port of bash script lines 404-563 (formatting functions)
 */

import chalk from 'chalk'
import type {
  SafeApiMultisigTransaction,
  DecodedTransactionData,
  DecodedFunction,
  SecurityAnalysisResult,
  SafeApiDataDecoded,
} from '@shield3/sky-safe-core'
import { getAddressTag } from '@shield3/sky-safe-core'
import type { Address } from 'viem'

/**
 * Print a section header
 */
export function printHeader(text: string): void {
  console.log(`\n${chalk.underline(text)}`)
}

/**
 * Print a labeled field
 */
export function printField(label: string, value: string | number): void {
  console.log(`${label}: ${chalk.green(value)}`)
}

/**
 * Print transaction data from Safe API
 */
export function printTransactionData(tx: SafeApiMultisigTransaction): void {
  printHeader('Transaction Data')
  printField('Safe address', tx.safe)

  // Print 'To' field with address tag if available
  const tag = getAddressTag(tx.to as Address)
  if (tag) {
    console.log(`To: ${chalk.green(tx.to)} ${chalk.blue(`[${tag.label}]`)}`)
    console.log(`    ${chalk.dim(tag.description)}`)
  } else {
    printField('To', tx.to)
  }

  printField('Value', `${tx.value} wei`)
  printField('Data', tx.data || '0x')

  // Operation type
  const operationType = tx.operation === 0 ? 'Call' : tx.operation === 1 ? 'DelegateCall' : 'Unknown'
  printField('Operation', operationType)

  printField('Safe Transaction Gas', tx.safeTxGas)
  printField('Base Gas', tx.baseGas)
  printField('Gas Price', tx.gasPrice)
  printField('Gas Token', tx.gasToken)
  printField('Refund Receiver', tx.refundReceiver)
  printField('Nonce', tx.nonce)

  // Status
  printField('Executed', tx.isExecuted ? 'Yes' : 'No')
  if (tx.isExecuted && tx.isSuccessful !== null) {
    printField('Successful', tx.isSuccessful ? 'Yes' : 'No')
  }

  // Confirmations
  printField('Confirmations', `${tx.confirmations.length}/${tx.confirmationsRequired}`)
}

/**
 * Print decoded transaction data (if available)
 * @param tx - Transaction data
 * @param verification - Optional verification result to display
 */
export function printDecodedData(tx: SafeApiMultisigTransaction, verification?: { verified: boolean; error?: string } | null): void {
  if (!tx.dataDecoded) {
    // Check for special cases
    if (!tx.data || tx.data === '0x') {
      const method = tx.to === tx.safe && tx.value === '0'
        ? '0x (On-Chain Rejection)'
        : tx.to === tx.safe && tx.value !== '0'
        ? '0x (ETH Self-Transfer)'
        : tx.to !== tx.safe && tx.value === '0'
        ? '0x (Zero-Value ETH Transfer)'
        : '0x (ETH Transfer)'

      printHeader('Decoded Data')
      printField('Method', method)
      printField('Parameters', '[]')
    } else {
      printHeader('Decoded Data')
      printField('Method', 'Unknown')
      printField('Parameters', 'Unknown (no decoding available from API)')
    }
    return
  }

  printHeader('Decoded Data')

  // Print method with verification status
  if (verification) {
    const verificationBadge = verification.verified
      ? chalk.green('✓ Verified')
      : chalk.red('⚠ Mismatch')
    console.log(`Method: ${chalk.green(tx.dataDecoded.method)} ${verificationBadge}`)
  } else {
    printField('Method', tx.dataDecoded.method)
  }

  // Show verification error if failed
  if (verification && !verification.verified && verification.error) {
    console.log(chalk.red(`  ⚠️  Warning: ${verification.error}`))
  }

  if (tx.dataDecoded.parameters.length > 0) {
    console.log('Parameters:')
    for (const param of tx.dataDecoded.parameters) {
      console.log(`  ${chalk.dim(param.name)} (${chalk.dim(param.type)}): ${chalk.cyan(param.value)}`)
    }
  } else {
    printField('Parameters', '[]')
  }
}

/**
 * Print nested transaction data with Safe API decoding and verification
 */
export function printNestedTransactionData(
  index: number,
  total: number,
  to: string,
  value: string,
  operation: number,
  data: string,
  apiDecoded?: SafeApiDataDecoded | null,
  customDecoded?: DecodedTransactionData | null,
  verification?: { verified: boolean; error?: string } | null
): void {
  console.log(chalk.bold.cyan(`\n[Transaction ${index + 1}/${total}]`))
  console.log(chalk.dim('─'.repeat(50)))

  // Print nested transaction details
  console.log(`${chalk.dim('To')}: ${chalk.green(to)}`)
  const tag = getAddressTag(to as Address)
  if (tag) {
    console.log(`    ${chalk.blue(`[${tag.label}]`)} ${chalk.dim(tag.description)}`)
  }

  console.log(`${chalk.dim('Value')}: ${chalk.green(value)} wei`)
  console.log(`${chalk.dim('Operation')}: ${chalk.green(operation === 0 ? 'Call' : operation === 1 ? 'DelegateCall' : 'Unknown')}`)

  // Print custom decoded data if available
  if (customDecoded) {
    console.log(chalk.dim('\nCustom Decoder Analysis:'))
    printCustomDecodedData(customDecoded)
  }
  // Otherwise print Safe API decoded data with verification
  else if (apiDecoded) {
    console.log(chalk.dim('\nSafe API Decoded Data:'))

    // Print method with verification status
    if (verification) {
      const verificationBadge = verification.verified
        ? chalk.green('✓ Verified')
        : chalk.red('⚠ Mismatch')
      console.log(`  Method: ${chalk.green(apiDecoded.method)} ${verificationBadge}`)
    } else {
      console.log(`  Method: ${chalk.green(apiDecoded.method)}`)
    }

    // Show verification error if failed
    if (verification && !verification.verified && verification.error) {
      console.log(chalk.red(`    ⚠️  Warning: ${verification.error}`))
    }

    // Print parameters
    if (apiDecoded.parameters.length > 0) {
      console.log('  Parameters:')
      for (const param of apiDecoded.parameters) {
        console.log(`    ${chalk.dim(param.name)} (${chalk.dim(param.type)}): ${chalk.cyan(param.value)}`)
      }
    } else {
      console.log('  Parameters: []')
    }
  }
  // Just show raw data if no decoding available
  else if (data && data !== '0x') {
    console.log(chalk.dim(`\nData: ${data.slice(0, 66)}${data.length > 66 ? '...' : ''}`))
  }
}

/**
 * Print custom decoded data with explanations
 */
export function printCustomDecodedData(decoded: DecodedTransactionData): void {
  printHeader('Custom Decoder Analysis')

  if (decoded.isMulticall) {
    // Print multicall header
    printDecodedFunction(decoded.main, 0)

    // Print nested calls
    if (decoded.nested && decoded.nested.length > 0) {
      console.log(chalk.dim('\nNested calls:'))
      for (let i = 0; i < decoded.nested.length; i++) {
        printDecodedFunction(decoded.nested[i]!, i + 1)
      }
    }
  } else {
    // Single function call
    printDecodedFunction(decoded.main, 0)
  }

  // Print general warnings
  if (decoded.generalWarnings && decoded.generalWarnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  General Warnings:'))
    for (const warning of decoded.generalWarnings) {
      console.log(chalk.yellow(`  • ${warning}`))
    }
  }
}

/**
 * Print a single decoded function
 */
function printDecodedFunction(func: DecodedFunction, index: number): void {
  const prefix = index > 0 ? `  [${index}] ` : ''

  console.log(`\n${prefix}${chalk.bold(func.name)}${chalk.dim(` (${func.signature})`)}`)
  console.log(`${prefix}${chalk.italic(func.explanation)}`)

  // Print parameters
  if (func.parameters.length > 0) {
    console.log(`${prefix}${chalk.dim('Parameters:')}`)
    for (const param of func.parameters) {
      console.log(`${prefix}  ${chalk.dim(param.name)} (${chalk.dim(param.type)}): ${chalk.cyan(String(param.value))}`)
    }
  }

  // Print function-specific warnings
  if (func.warnings && func.warnings.length > 0) {
    for (const warning of func.warnings) {
      console.log(`${prefix}${chalk.yellow(`⚠️  ${warning}`)}`)
    }
  }

  // Print risk level
  if (func.riskLevel && func.riskLevel !== 'none') {
    const riskColor = func.riskLevel === 'high' ? chalk.red
      : func.riskLevel === 'medium' ? chalk.yellow
      : chalk.blue
    console.log(`${prefix}${riskColor(`Risk: ${func.riskLevel}`)}`)
  }
}

/**
 * Print network configuration
 */
export function printNetworkConfig(network: string, chainId: number): void {
  console.log(chalk.bold('\n==================================='))
  console.log(chalk.bold('= Selected Network Configuration ='))
  console.log(chalk.bold('===================================\n'))
  printField('Network', network)
  printField('Chain ID', chainId)
}

/**
 * Print safe transaction hash
 */
export function printSafeTxHash(hash: string): void {
  printHeader('Safe Transaction Hash')
  console.log(chalk.green(hash))
}

/**
 * Print hash calculation results and verification
 * Reference: bash script lines 480-485, 664-673
 */
export function printHashVerification(
  domainHash: string,
  messageHash: string,
  calculatedHash: string,
  apiHash: string,
  isValid: boolean,
  version: string
): void {
  console.log(`\n${chalk.dim('Safe Version')}: ${chalk.cyan(version)}`)

  printHeader('Computed Hashes')

  // Format hashes in Ledger-style (matching hardware wallet display)
  console.log(chalk.dim('Domain Hash:'))
  console.log(chalk.green(domainHash))

  console.log(chalk.dim('\nMessage Hash:'))
  console.log(chalk.green(messageHash))

  console.log(chalk.dim('\nSafe Transaction Hash (Calculated):'))
  console.log(chalk.green(calculatedHash))

  console.log(chalk.dim('\nSafe Transaction Hash (API):'))
  console.log(chalk.green(apiHash))

  // Verification result
  console.log()
  if (isValid) {
    console.log(chalk.bold.green('✓ HASH VERIFIED: Calculated hash matches API hash'))
    console.log(chalk.dim('  This is the hash you should see on your hardware wallet (e.g., Ledger).'))
    console.log(chalk.dim('  It is safe to sign this transaction if all parameters are correct.'))
  } else {
    console.log(chalk.bold.red('✗ HASH MISMATCH: Calculated hash does NOT match API hash'))
    console.log(chalk.red('  DO NOT SIGN THIS TRANSACTION!'))
    console.log(chalk.yellow('  This indicates a potential issue with:'))
    console.log(chalk.yellow('    - Transaction data from the API'))
    console.log(chalk.yellow('    - Safe version mismatch'))
    console.log(chalk.yellow('    - Hash calculation implementation'))
  }
}

/**
 * Print security analysis warnings
 * Reference: bash script lines 789-853 (security checks)
 */
export function printSecurityWarnings(analysis: SecurityAnalysisResult): void {
  // Overall risk header
  if (analysis.overallRisk === 'none') {
    console.log(chalk.green('\n✓ No security risks detected'))
    return
  }

  console.log(chalk.bold('\n========================================'))
  console.log(chalk.bold('= Security Analysis                   ='))
  console.log(chalk.bold('========================================'))

  // Overall risk level
  const riskColor =
    analysis.overallRisk === 'critical'
      ? chalk.bold.red
      : analysis.overallRisk === 'high'
        ? chalk.red
        : analysis.overallRisk === 'medium'
          ? chalk.yellow
          : chalk.blue

  console.log(riskColor(`\nOverall Risk Level: ${analysis.overallRisk.toUpperCase()}`))

  // Delegate call warnings
  if (analysis.delegateCall.warning) {
    console.log(chalk.bold.red('\n⚠️  DELEGATE CALL WARNING'))
    console.log(chalk.red(analysis.delegateCall.warning))
    console.log(chalk.dim('  Target: ' + analysis.delegateCall.targetAddress))
  } else if (analysis.delegateCall.isDelegateCall && analysis.delegateCall.isTrusted) {
    console.log(chalk.blue('\nℹ️  This transaction uses a trusted delegate call'))
    console.log(chalk.dim('  Target: ' + analysis.delegateCall.targetAddress))
  }

  // Gas token warnings
  if (analysis.gasToken.warnings.length > 0) {
    console.log(chalk.bold.red('\n⚠️  GAS TOKEN WARNINGS'))
    for (const warning of analysis.gasToken.warnings) {
      console.log(chalk.red('  • ' + warning))
    }
    if (analysis.gasToken.usesCustomGasToken) {
      console.log(chalk.dim('  Gas Token: ' + analysis.gasToken.gasToken))
    }
    if (analysis.gasToken.usesCustomRefundReceiver) {
      console.log(chalk.dim('  Refund Receiver: ' + analysis.gasToken.refundReceiver))
    }
    if (analysis.gasToken.hasNonZeroGasPrice) {
      console.log(chalk.dim('  Gas Price: ' + analysis.gasToken.gasPrice))
    }
  }

  // Owner modification warnings
  if (analysis.ownerModification.warning) {
    console.log(chalk.bold.red('\n⚠️  OWNER/THRESHOLD MODIFICATION WARNING'))
    console.log(chalk.red(analysis.ownerModification.warning))

    console.log(chalk.dim('\n  Detected modifications:'))
    for (const mod of analysis.ownerModification.modifications) {
      const nestedTag = mod.isNested ? ' (nested in MultiSend)' : ' (direct call)'
      console.log(chalk.red(`    • ${mod.functionName}${nestedTag}`))
    }
  }

  // Module/Guard warnings
  if (analysis.moduleGuard.warnings && analysis.moduleGuard.warnings.length > 0) {
    console.log(chalk.bold.red('\n⚠️  MODULE/GUARD SECURITY WARNING'))
    for (const warning of analysis.moduleGuard.warnings) {
      console.log(chalk.red(warning))
    }

    if (analysis.moduleGuard.detections.length > 0) {
      console.log(chalk.dim('\n  Detected operations:'))
      for (const detection of analysis.moduleGuard.detections) {
        const nestedTag = detection.isNested ? ' (nested in MultiSend)' : ' (direct call)'
        const trustTag = detection.isTrusted ? ' [TRUSTED]' : ' [UNTRUSTED]'
        const targetInfo = detection.targetAddress ? ` → ${detection.targetAddress}` : ''
        console.log(chalk.red(`    • ${detection.functionName}${targetInfo}${trustTag}${nestedTag}`))
      }
    }
  }

  // Final warning if requires careful review
  if (analysis.requiresCarefulReview) {
    console.log(chalk.bold.red('\n⚠️  This transaction requires CAREFUL REVIEW before signing!'))
    console.log(chalk.yellow('  Please verify all parameters and ensure you understand the implications.'))
  }
}
