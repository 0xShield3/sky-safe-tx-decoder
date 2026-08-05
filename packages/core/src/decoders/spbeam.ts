/**
 * Custom decoder for Sky Protocol SPBEAM
 * (Sky Protocol Bounded External Access Module)
 *
 * Contract: 0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22 (Ethereum mainnet)
 *
 * Why this decoder exists: the Safe Transaction Service has no ABI cached for
 * this contract, so its API returns `dataDecoded: null` and every SPBEAM
 * transaction arrives as undecoded calldata. The ABI below is transcribed from
 * the source verified on Sourcify (exact match, verified 2025-04-08,
 * `src/SPBEAM.sol:SPBEAM`, solc 0.8.24+commit.e11b9ed9). It is pinned to one
 * address on one network — this decoder never guesses an ABI from a selector
 * lookup, and every decode is re-encoded and compared against the raw calldata
 * before it is returned.
 *
 * Docs: https://docs.sky.money/
 */

import type { Address, Hex } from 'viem'
import { decodeFunctionData, parseAbi } from 'viem'
import type { CustomDecoder, DecodedFunction, DecodedTransactionData } from './types.js'
import { bpsToPercent, bytes32ToLabel, checkReencode } from './sky-common.js'

/**
 * SPBEAM ABI (external state-changing functions).
 *
 * `set` takes an array of `ParamChange` structs, which ABI-encodes as
 * `(bytes32,uint256)[]`.
 */
const SPBEAM_ABI = parseAbi([
  // Bulk rate updates
  'function set((bytes32 id, uint256 bps)[] updates)',

  // Configuration
  'function file(bytes32 what, uint256 data)',
  'function file(bytes32 id, bytes32 what, uint256 data)',

  // Authorisation (wards)
  'function rely(address usr)',
  'function deny(address usr)',

  // Facilitator allowlist (buds)
  'function kiss(address usr)',
  'function diss(address usr)',
])

/** A single entry of the `updates` array passed to `set` */
interface ParamChange {
  id: Hex
  bps: bigint
}

/**
 * SPBEAM contract decoder
 */
export class SPBEAMDecoder implements CustomDecoder {
  readonly contractAddress: Address = '0x36B072ed8AFE665E3Aa6DaBa79Decbec63752b22'
  readonly contractName = 'SPBEAM'
  readonly network = 'ethereum'

  canDecode(to: Address, data: Hex): boolean {
    return to.toLowerCase() === this.contractAddress.toLowerCase() && data.length > 10
  }

  decode(data: Hex): DecodedTransactionData {
    const { functionName, args } = decodeFunctionData({
      abi: SPBEAM_ABI,
      data,
    })

    const decodedArgs = (args ?? []) as readonly unknown[]
    const main = this.decodeFunction(functionName, decodedArgs)

    // Re-encode and byte-compare. viem's decoder ignores bytes appended past
    // the end of the encoded arguments, so without this check a transaction
    // carrying extra trailing calldata would render as a clean, ordinary call.
    const reencodeWarnings = checkReencode(SPBEAM_ABI, functionName, decodedArgs, data)
    if (reencodeWarnings.length > 0) {
      main.warnings = [...(main.warnings ?? []), ...reencodeWarnings]
      main.riskLevel = 'high'
      return { main, isMulticall: false, generalWarnings: reencodeWarnings }
    }

    return { main, isMulticall: false }
  }

  getSupportedFunctions(): string[] {
    return ['set', 'file', 'rely', 'deny', 'kiss', 'diss']
  }

  /**
   * Dispatch to the per-function decoder
   */
  private decodeFunction(functionName: string, args: readonly unknown[]): DecodedFunction {
    switch (functionName) {
      case 'set':
        return this.decodeSet(args)
      case 'file':
        return args.length === 3 ? this.decodeFileById(args) : this.decodeFileGlobal(args)
      case 'rely':
        return this.decodeAuth('rely', args)
      case 'deny':
        return this.decodeAuth('deny', args)
      case 'kiss':
        return this.decodeBud('kiss', args)
      case 'diss':
        return this.decodeBud('diss', args)
      default:
        return this.decodeUnsupported(functionName, args)
    }
  }

  /**
   * Decode set((bytes32,uint256)[])
   *
   * Each entry sets one rate parameter, identified by an ilk/rate id encoded as
   * a right-padded ASCII bytes32 (e.g. "ETH-A", "SSR"), to a value in basis
   * points. The full bytes32 is always shown alongside the ASCII label — the
   * label is a convenience, the bytes are the ground truth.
   */
  private decodeSet(args: readonly unknown[]): DecodedFunction {
    const updates = (args[0] ?? []) as readonly ParamChange[]

    const rows = updates.map(update => {
      const label = bytes32ToLabel(update.id)
      return {
        id: update.id,
        bps: update.bps,
        label,
        percent: bpsToPercent(update.bps),
      }
    })

    const warnings: string[] = []

    // A repeated id means the later entry silently overwrites the earlier one.
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const row of rows) {
      const key = row.id.toLowerCase()
      if (seen.has(key)) duplicates.add(row.id)
      seen.add(key)
    }
    for (const duplicate of duplicates) {
      warnings.push(
        `⚠️ id ${duplicate} appears more than once in this batch. Only the last value for it takes effect.`
      )
    }

    if (rows.length === 0) {
      warnings.push('⚠️ This call sets zero parameters. Confirm that is intended.')
    }

    const listing = rows
      .map(row => `  • ${row.label} — ${row.bps.toString()} bps (${row.percent})`)
      .join('\n')

    return {
      name: 'set',
      signature: 'set((bytes32,uint256)[])',
      parameters: rows.map((row, i) => ({
        name: `updates[${i}] — ${row.label}`,
        type: '(bytes32,uint256)',
        value: `${row.id} → ${row.bps.toString()} bps (${row.percent})`,
      })),
      explanation:
        `Set ${rows.length} Sky rate parameter${rows.length === 1 ? '' : 's'} through SPBEAM ` +
        `(Sky Protocol Bounded External Access Module):\n${listing}\n\n` +
        `Values are in basis points (1 bps = 0.01%).`,
      warnings: warnings.length > 0 ? warnings : undefined,
      riskLevel: 'medium',
    }
  }

  /**
   * Decode file(bytes32 id, bytes32 what, uint256 data) — per-id configuration
   */
  private decodeFileById(args: readonly unknown[]): DecodedFunction {
    const [id, what, data] = args as [Hex, Hex, bigint]
    const idLabel = bytes32ToLabel(id)
    const whatLabel = bytes32ToLabel(what)

    return {
      name: 'file',
      signature: 'file(bytes32,bytes32,uint256)',
      parameters: [
        { name: 'id', type: 'bytes32', value: `${id} — ${idLabel}` },
        { name: 'what', type: 'bytes32', value: `${what} — ${whatLabel}` },
        { name: 'data', type: 'uint256', value: data },
      ],
      explanation:
        `Change the SPBEAM configuration value "${whatLabel}" for id "${idLabel}" to ` +
        `${data.toString()}. Per-id configuration sets the bounds SPBEAM enforces on ` +
        `rate updates (minimum, maximum, and maximum step), so this changes what future ` +
        `set() calls are permitted to do without further governance approval.`,
      warnings: [
        '⚠️ This modifies the bounds that constrain SPBEAM rate changes, not a rate itself.',
      ],
      riskLevel: 'high',
    }
  }

  /**
   * Decode file(bytes32 what, uint256 data) — module-wide configuration
   */
  private decodeFileGlobal(args: readonly unknown[]): DecodedFunction {
    const [what, data] = args as [Hex, bigint]
    const whatLabel = bytes32ToLabel(what)

    return {
      name: 'file',
      signature: 'file(bytes32,uint256)',
      parameters: [
        { name: 'what', type: 'bytes32', value: `${what} — ${whatLabel}` },
        { name: 'data', type: 'uint256', value: data },
      ],
      explanation:
        `Change the module-wide SPBEAM configuration value "${whatLabel}" to ${data.toString()}.`,
      warnings: ['⚠️ This modifies SPBEAM module configuration.'],
      riskLevel: 'high',
    }
  }

  /**
   * Decode rely(address) / deny(address) — ward (admin) changes
   */
  private decodeAuth(name: 'rely' | 'deny', args: readonly unknown[]): DecodedFunction {
    const [usr] = args as [Address]
    const granting = name === 'rely'

    return {
      name,
      signature: `${name}(address)`,
      parameters: [{ name: 'usr', type: 'address', value: usr }],
      explanation: granting
        ? `Grant full admin (ward) rights over SPBEAM to ${usr}. A ward can change every module and per-id configuration value and can add or remove other wards.`
        : `Revoke admin (ward) rights over SPBEAM from ${usr}.`,
      warnings: [
        granting
          ? `⚠️ This grants complete administrative control of SPBEAM to ${usr}.`
          : `⚠️ This removes administrative control of SPBEAM from ${usr}. Confirm at least one trusted ward remains.`,
      ],
      riskLevel: 'high',
    }
  }

  /**
   * Decode kiss(address) / diss(address) — facilitator (bud) allowlist changes
   */
  private decodeBud(name: 'kiss' | 'diss', args: readonly unknown[]): DecodedFunction {
    const [usr] = args as [Address]
    const adding = name === 'kiss'

    return {
      name,
      signature: `${name}(address)`,
      parameters: [{ name: 'usr', type: 'address', value: usr }],
      explanation: adding
        ? `Authorise ${usr} to call set() on SPBEAM. This address will be able to change rate parameters within the configured bounds, without further governance approval.`
        : `Remove ${usr} from the list of addresses authorised to call set() on SPBEAM.`,
      warnings: [
        adding
          ? `⚠️ This lets ${usr} change Sky rate parameters within the configured bounds.`
          : `⚠️ This removes rate-setting access from ${usr}.`,
      ],
      riskLevel: adding ? 'high' : 'medium',
    }
  }

  /**
   * Handle functions in the ABI that have no dedicated decoder
   */
  private decodeUnsupported(functionName: string, args: readonly unknown[]): DecodedFunction {
    return {
      name: functionName,
      signature: `${functionName}(...)`,
      parameters: args.map((arg, i) => ({
        name: `arg${i}`,
        type: 'unknown',
        value: String(arg),
      })),
      explanation: `⚠️ Function "${functionName}" is recognised but not yet fully supported by this decoder.`,
      warnings: [`Custom decoder for "${functionName}" is not yet implemented. Verify transaction carefully.`],
      riskLevel: 'medium',
    }
  }
}
