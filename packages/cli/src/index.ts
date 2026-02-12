#!/usr/bin/env node

/**
 * Sky Safe Transaction Decoder CLI
 *
 * CLI tool for calculating and verifying Safe multisig transaction hashes.
 * TypeScript port of safe-tx-hashes-util bash script.
 *
 * @see https://github.com/pcaversaccio/safe-tx-hashes-util
 */

import { Command } from 'commander'
import { createVerifyCommand } from './commands/verify.js'

const program = new Command()

program
  .name('sky-safe')
  .description('Safe multisig transaction hash calculator and decoder')
  .version('0.1.4')

// Verify command - Fetch and display transaction
program.addCommand(createVerifyCommand())

// Show help if no command provided
if (process.argv.length === 2) {
  program.help()
}

// Parse arguments
program.parse()
