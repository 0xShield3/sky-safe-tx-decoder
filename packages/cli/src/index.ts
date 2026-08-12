#!/usr/bin/env node

/**
 * Sky Safe Transaction Decoder CLI
 *
 * CLI tool for calculating and verifying Safe multisig transaction hashes.
 * TypeScript port of safe-tx-hashes-util bash script.
 *
 * @see https://github.com/pcaversaccio/safe-tx-hashes-util
 */

import { createRequire } from 'node:module'
import { Command } from 'commander'
import { createVerifyCommand } from './commands/verify.js'

// Read the version from package.json rather than repeating it here. The literal
// that used to sit in this file said 0.1.5 while the package was 0.3.0, so
// `sky-safe --version` misreported which build was running — the one question a
// user asks when checking they have the release they verified the checksum of.
const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const program = new Command()

program
  .name('sky-safe')
  .description('Safe multisig transaction hash calculator and decoder')
  .version(version)

// Verify command - Fetch and display transaction
program.addCommand(createVerifyCommand())

// Show help if no command provided
if (process.argv.length === 2) {
  program.help()
}

// Parse arguments
program.parse()
