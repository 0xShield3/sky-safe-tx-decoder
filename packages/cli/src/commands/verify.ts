/**
 * Verify command - Fetch and display Safe transaction from API
 *
 * Usage:
 *   sky-safe verify --address 0x... --nonce 123 [--network ethereum]
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { readFileSync } from 'fs'
import inquirer from 'inquirer'
import {
  createSafeApiClient,
  SafeApiError,
  isNetworkSupported,
  decoderRegistry,
  LockstakeEngineDecoder,
  calculateSafeTxHash,
  verifySafeTxHash,
  analyzeSecurity,
  decodeMultiSend,
  isMultiSend,
  verifyDecodedData,
} from '@shield3/sky-safe-core'
import type { SafeApiMultisigTransaction } from '@shield3/sky-safe-core'
import type { Address, Hex } from 'viem'
import {
  printNetworkConfig,
  printTransactionData,
  printDecodedData,
  printCustomDecodedData,
  printNestedTransactionData,
  printHashVerification,
  printSecurityWarnings,
} from '../formatters/output.js'

// Register custom decoders
decoderRegistry.register(new LockstakeEngineDecoder())

export function createVerifyCommand(): Command {
  const command = new Command('verify')

  command
    .description('Fetch and verify a Safe transaction from the Safe Transaction Service or local file')
    .option('-a, --address <address>', 'Safe multisig address')
    .option('-n, --nonce <nonce>', 'Transaction nonce', parseNonce)
    .option(
      '--network <network>',
      'Network name (e.g., ethereum, sepolia)',
      'ethereum'
    )
    .option(
      '-f, --file <file>',
      'Read transaction from JSON file instead of API'
    )
    .action(async (options: { address?: string; nonce?: number; network: string; file?: string }) => {
      try {
        // Validate mode
        if (options.file && (options.address || options.nonce !== undefined)) {
          console.error(chalk.red('✗ Cannot use both --file and --address/--nonce'))
          console.error(chalk.dim('  Use --file for local mode OR --address/--nonce for API mode'))
          process.exit(1)
        }

        if (!options.file && (!options.address || options.nonce === undefined)) {
          console.error(chalk.red('✗ Missing required options'))
          console.error(chalk.dim('  Use either:'))
          console.error(chalk.dim('    --file <file>           (local mode)'))
          console.error(chalk.dim('    --address <address> --nonce <nonce>  (API mode)'))
          process.exit(1)
        }

        // Validate network
        if (!isNetworkSupported(options.network)) {
          console.error(chalk.red(`✗ Unsupported network: ${options.network}`))
          console.error(chalk.dim('  Run `sky-safe networks` to see supported networks'))
          process.exit(1)
        }

        // Create API client for network info
        const client = createSafeApiClient(options.network)

        // Show network config
        printNetworkConfig(client.getNetworkName(), client.getChainId())

        let tx: SafeApiMultisigTransaction
        let version: string

        if (options.file) {
          // Local mode: read from file
          const spinner = ora('Reading transaction from file...').start()
          try {
            const fileContent = readFileSync(options.file, 'utf-8')
            const jsonData = JSON.parse(fileContent)

            tx = jsonData.transaction
            version = jsonData.version || '1.3.0' // Default to 1.3.0 if not specified

            if (!tx) {
              throw new Error('Invalid JSON: missing "transaction" field')
            }

            spinner.succeed('Transaction loaded from file')
          } catch (error) {
            spinner.fail('Failed to read transaction file')
            if (error instanceof Error) {
              console.error(chalk.red(`  ${error.message}`))
            }
            process.exit(1)
          }
        } else {
          // API mode: fetch from Safe API
          // Validate address format (basic check)
          if (!options.address!.match(/^0x[a-fA-F0-9]{40}$/)) {
            console.error(chalk.red(`✗ Invalid address format: ${options.address}`))
            console.error(chalk.dim('  Address must be a 40-character hex string starting with 0x'))
            process.exit(1)
          }

          const spinner = ora('Fetching transaction(s) from Safe API...').start()

          try {
            // Fetch all transactions with this nonce
            const transactions = await client.fetchTransactionsByNonce(options.address as Address, options.nonce!)

            spinner.stop()

            // If multiple transactions found, let user select
            if (transactions.length > 1) {
              console.log(chalk.yellow(`\n⚠️  Found ${transactions.length} transactions with nonce ${options.nonce}`))
              console.log(chalk.dim('   This can happen when transactions are replaced or cancelled.\n'))

              const choices = transactions.map((t, idx) => {
                const submissionDate = t.submissionDate ? new Date(t.submissionDate).toLocaleString() : 'Unknown'
                const status = t.isExecuted
                  ? (t.isSuccessful ? '✅ Executed' : '❌ Failed')
                  : `⏳ Pending (${t.confirmations?.length || 0}/${t.confirmationsRequired} sigs)`

                return {
                  name: `[${idx + 1}] ${status} | Submitted: ${submissionDate} | Hash: ${t.safeTxHash.slice(0, 10)}...`,
                  value: idx,
                  short: `Transaction ${idx + 1}`
                }
              })

              const answer = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'txIndex',
                  message: 'Select which transaction to analyze:',
                  choices: choices,
                }
              ])

              tx = transactions[answer.txIndex]!
              console.log(chalk.green(`\n✓ Selected transaction ${answer.txIndex + 1}\n`))
            } else {
              tx = transactions[0]!
            }

            const spinner2 = ora('Fetching Safe version...').start()
            version = await client.fetchSafeVersion(options.address as Address)
            spinner2.succeed('Transaction fetched successfully')
          } catch (error) {
            spinner.fail('Failed to fetch transaction')
            throw error
          }
        }

        // Display transaction data
        console.log(chalk.bold('\n========================================'))
        console.log(chalk.bold('= Transaction Data and Decoded Info   ='))
        console.log(chalk.bold('========================================'))

        printTransactionData(tx)

        // Verify decoded data if available
        let apiDecodedVerification = null
        if (tx.data && tx.data !== '0x' && tx.dataDecoded) {
          apiDecodedVerification = verifyDecodedData(tx.data as Hex, tx.dataDecoded)
        }

        printDecodedData(tx, apiDecodedVerification)

        // Try custom decoder if available OR decode MultiSend
        if (tx.data && tx.data !== '0x') {
          // Check if this is a MultiSend transaction
          if (isMultiSend(tx.data as Hex)) {
            console.log(chalk.bold('\n========================================'))
            console.log(chalk.bold('= MultiSend Batched Transactions      ='))
            console.log(chalk.bold('========================================'))

            // Verify the outer MultiSend transaction itself
            if (tx.dataDecoded) {
              const multiSendVerification = verifyDecodedData(tx.data as Hex, tx.dataDecoded)
              if (multiSendVerification.verified) {
                console.log(chalk.green('\n✓ MultiSend outer transaction verified'))
              } else {
                console.log(chalk.red('\n⚠ MultiSend outer transaction verification failed'))
                if (multiSendVerification.error) {
                  console.log(chalk.red(`  ${multiSendVerification.error}`))
                }
              }
            }

            const nestedTxs = decodeMultiSend(tx.data as Hex)

            // Get Safe API decoded nested transactions from valueDecoded
            let apiNestedTxs = null
            if (tx.dataDecoded?.parameters) {
              const transactionsParam = tx.dataDecoded.parameters.find(p => p.name === 'transactions')
              if (transactionsParam?.valueDecoded && Array.isArray(transactionsParam.valueDecoded)) {
                apiNestedTxs = transactionsParam.valueDecoded
              }
            }

            if (nestedTxs) {
              console.log(chalk.dim(`\nFound ${nestedTxs.length} nested transaction(s)\n`))

              for (let i = 0; i < nestedTxs.length; i++) {
                const nestedTx = nestedTxs[i]!

                // Try to decode with custom decoder
                let customDecoded = null
                if (nestedTx.data && nestedTx.data !== '0x') {
                  customDecoded = decoderRegistry.decode(nestedTx.to as Address, nestedTx.data, options.network)
                }

                // Get Safe API decoded data for this nested transaction
                const apiDecoded = apiNestedTxs?.[i]?.dataDecoded || null

                // Verify Safe API decoded data
                let verification = null
                if (apiDecoded && nestedTx.data && nestedTx.data !== '0x') {
                  verification = verifyDecodedData(nestedTx.data, apiDecoded)
                }

                // Print using the new formatter
                printNestedTransactionData(
                  i,
                  nestedTxs.length,
                  nestedTx.to,
                  nestedTx.value.toString(),
                  nestedTx.operation,
                  nestedTx.data,
                  apiDecoded,
                  customDecoded,
                  verification
                )
              }
            }
          } else {
            // Try direct custom decoder
            const customDecoded = decoderRegistry.decode(tx.to, tx.data, options.network)
            if (customDecoded) {
              printCustomDecodedData(customDecoded)
            } else if (decoderRegistry.hasDecoder(tx.to, options.network)) {
              // Decoder exists but couldn't decode - might be unsupported function
              console.log(chalk.yellow('\n⚠️  This contract has a custom decoder, but the function is not yet supported.'))
              console.log(chalk.dim('   Please verify the transaction carefully.'))
            }
          }
        }

        // Perform security analysis
        const txData = {
          to: tx.to,
          value: tx.value,
          data: (tx.data || '0x') as Hex,
          operation: tx.operation,
          safeTxGas: String(tx.safeTxGas),
          baseGas: String(tx.baseGas),
          gasPrice: tx.gasPrice,
          gasToken: tx.gasToken,
          refundReceiver: tx.refundReceiver,
          nonce: String(tx.nonce),
        }

        const securityAnalysis = analyzeSecurity(txData)
        printSecurityWarnings(securityAnalysis)

        // Calculate Safe transaction hash
        console.log(chalk.bold('\n========================================'))
        console.log(chalk.bold('= Hash Calculation & Verification     ='))
        console.log(chalk.bold('========================================'))

        try {
          const safeAddress = options.file ? tx.safe : options.address!
          const hashResult = calculateSafeTxHash(
            client.getChainId(),
            safeAddress as Address,
            txData,
            version
          )

          // Verify the calculated hash matches the API hash
          const isValid = verifySafeTxHash(hashResult.safeTxHash, tx.safeTxHash as Hex)

          printHashVerification(
            hashResult.domainHash,
            hashResult.messageHash,
            hashResult.safeTxHash,
            tx.safeTxHash as Hex,
            isValid,
            version
          )
        } catch (error) {
          console.log(chalk.red('\n✗ Hash calculation failed'))
          console.log(chalk.dim(`  Error: ${error instanceof Error ? error.message : String(error)}`))
          console.log(chalk.yellow('\n⚠️  Cannot verify transaction hash - proceed with caution!'))
        }

        console.log() // Empty line at end
      } catch (error) {
        if (error instanceof SafeApiError) {
          console.error(chalk.red(`\n✗ ${error.message}`))
          if (error.statusCode === 404) {
            console.error(
              chalk.dim(
                '  Make sure the Safe address exists on this network and the transaction has been proposed.'
              )
            )
          }
        } else {
          console.error(chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}`))
        }
        process.exit(1)
      }
    })

  return command
}

/**
 * Parse nonce from string to number
 */
function parseNonce(value: string): number {
  const nonce = parseInt(value, 10)
  if (isNaN(nonce) || nonce < 0) {
    throw new Error(`Invalid nonce: ${value}. Must be a non-negative integer.`)
  }
  return nonce
}
