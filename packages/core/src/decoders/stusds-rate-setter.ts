/**
 * Custom decoder for Sky Protocol StUsdsRateSetter
 *
 * Contract: 0x30784615252B13E1DbE2bDf598627eaC297Bf4C5 (Ethereum mainnet)
 *
 * Why this decoder exists: the Safe Transaction Service has no record of this
 * contract at all (GET /api/v1/contracts/<address>/ returns 404), so its API
 * returns `dataDecoded: null` and every call arrives as undecoded calldata.
 * The ABI below is transcribed from the source verified on Sourcify
 * (`src/StUsdsRateSetter.sol:StUsdsRateSetter`, solc 0.8.21+commit.d9974bed).
 * It is pinned to one address on one network — this decoder never guesses an
 * ABI from a selector lookup, and every decode is re-encoded and compared
 * against the raw calldata before it is returned.
 *
 * Docs: https://docs.sky.money/
 */

import type { Address, Hex } from 'viem'
import { decodeFunctionData, parseAbi } from 'viem'
import type { CustomDecoder, DecodedFunction, DecodedTransactionData } from './types.js'
import { bpsToPercent, bytes32ToLabel, checkReencode, radToWholeTokens } from './sky-common.js'

/**
 * StUsdsRateSetter ABI (external state-changing functions)
 */
const STUSDS_RATE_SETTER_ABI = parseAbi([
  // Rate / ceiling updates
  'function set(uint256 strBps, uint256 dutyBps, uint256 line, uint256 cap)',

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

/**
 * StUsdsRateSetter contract decoder
 */
export class StUsdsRateSetterDecoder implements CustomDecoder {
  readonly contractAddress: Address = '0x30784615252B13E1DbE2bDf598627eaC297Bf4C5'
  readonly contractName = 'StUsdsRateSetter'
  readonly network = 'ethereum'

  canDecode(to: Address, data: Hex): boolean {
    return to.toLowerCase() === this.contractAddress.toLowerCase() && data.length > 10
  }

  decode(data: Hex): DecodedTransactionData {
    const { functionName, args } = decodeFunctionData({
      abi: STUSDS_RATE_SETTER_ABI,
      data,
    })

    const decodedArgs = (args ?? []) as readonly unknown[]
    const main = this.decodeFunction(functionName, decodedArgs)

    // Re-encode and byte-compare — viem's decoder ignores trailing calldata.
    const reencode = checkReencode(STUSDS_RATE_SETTER_ABI, functionName, decodedArgs, data)

    // Trailing bytes leave the decoded parameters correct, so they are reported
    // as a warning rather than a decoder-verification failure. See spbeam.ts.
    if (reencode.status === 'trailing') {
      main.warnings = [...(main.warnings ?? []), ...reencode.warnings]
      if (main.riskLevel !== 'high') main.riskLevel = 'medium'
      return { main, isMulticall: false }
    }

    if (reencode.status !== 'exact') {
      main.warnings = [...(main.warnings ?? []), ...reencode.warnings]
      main.riskLevel = 'high'
      return { main, isMulticall: false, generalWarnings: reencode.warnings }
    }

    return { main, isMulticall: false }
  }

  getSupportedFunctions(): string[] {
    return ['set', 'file', 'rely', 'deny', 'kiss', 'diss']
  }

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
   * Decode set(uint256 strBps, uint256 dutyBps, uint256 line, uint256 cap)
   *
   * One call sets four things at once:
   *   strBps  — the stUSDS savings rate, in basis points
   *   dutyBps — the ilk stability fee (jug duty), in basis points
   *   line    — the stUSDS debt ceiling, RAD-scaled (10^45)
   *   cap     — the stUSDS supply cap, passed straight through to
   *             stUSDS.file("cap", …)
   *
   * `line` is RAD-scaled: the contract requires `maxLine` to be either zero or
   * at least RAD (10^45), the Sky/Maker convention for debt ceilings. `cap` is
   * only bounded above by `maxCap`, so no scaling is assumed for it — the raw
   * integer is shown and the reviewer can scale it in the UI.
   */
  private decodeSet(args: readonly unknown[]): DecodedFunction {
    const [strBps, dutyBps, line, cap] = args as [bigint, bigint, bigint, bigint]

    return {
      name: 'set',
      signature: 'set(uint256,uint256,uint256,uint256)',
      parameters: [
        { name: 'strBps', type: 'uint256', value: `${strBps.toString()} bps (${bpsToPercent(strBps)})` },
        { name: 'dutyBps', type: 'uint256', value: `${dutyBps.toString()} bps (${bpsToPercent(dutyBps)})` },
        { name: 'line', type: 'uint256', value: line },
        { name: 'cap', type: 'uint256', value: cap },
      ],
      explanation:
        `Set four Sky stUSDS parameters in one call:\n` +
        `  • stUSDS savings rate (str) — ${strBps.toString()} bps (${bpsToPercent(strBps)})\n` +
        `  • Stability fee (duty) — ${dutyBps.toString()} bps (${bpsToPercent(dutyBps)})\n` +
        `  • Debt ceiling (line) — ${line.toString()} (RAD, 10^45) ≈ ${radToWholeTokens(line)} USDS\n` +
        `  • Supply cap (cap) — ${cap.toString()} (raw integer; scaling set by the stUSDS contract)\n\n` +
        `Rates are in basis points (1 bps = 0.01%). This call also triggers a drip on ` +
        `stUSDS and on the jug for this ilk before the new rates are written.`,
      riskLevel: 'medium',
    }
  }

  /**
   * Decode file(bytes32 id, bytes32 what, uint256 data) — per-rate bounds
   *
   * `id` selects which rate's config is changed ("STR" for the savings rate, or
   * the ilk for the stability fee). `what` is one of min / max / step.
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
        `Change the StUsdsRateSetter bound "${whatLabel}" for rate "${idLabel}" to ` +
        `${data.toString()}. The min, max, and step bounds decide which values a ` +
        `facilitator may pass to set() without further governance approval.`,
      warnings: [
        '⚠️ This modifies the bounds that constrain rate changes, not a rate itself.',
      ],
      riskLevel: 'high',
    }
  }

  /**
   * Decode file(bytes32 what, uint256 data) — module-wide configuration
   *
   * Recognised values of `what` are bad, tau, toc, maxLine, and maxCap.
   */
  private decodeFileGlobal(args: readonly unknown[]): DecodedFunction {
    const [what, data] = args as [Hex, bigint]
    const whatLabel = bytes32ToLabel(what)

    const detail: Record<string, string> = {
      bad: 'Halt flag. 1 halts the module, 0 resumes it.',
      tau: 'Minimum number of seconds between set() calls.',
      toc: 'Timestamp of the last set() call.',
      maxLine: 'Upper bound on the debt ceiling that set() may write, RAD-scaled (10^45).',
      maxCap: 'Upper bound on the supply cap that set() may write.',
    }

    return {
      name: 'file',
      signature: 'file(bytes32,uint256)',
      parameters: [
        { name: 'what', type: 'bytes32', value: `${what} — ${whatLabel}` },
        { name: 'data', type: 'uint256', value: data },
      ],
      explanation:
        `Change the module-wide StUsdsRateSetter configuration value "${whatLabel}" to ` +
        `${data.toString()}.${detail[whatLabel] ? ` ${detail[whatLabel]}` : ''}`,
      warnings: [
        whatLabel === 'bad' && data === 0n
          ? '⚠️ This resumes a halted module.'
          : '⚠️ This modifies StUsdsRateSetter module configuration.',
      ],
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
        ? `Grant full admin (ward) rights over StUsdsRateSetter to ${usr}. A ward can change every module and per-rate configuration value and can add or remove other wards and facilitators.`
        : `Revoke admin (ward) rights over StUsdsRateSetter from ${usr}.`,
      warnings: [
        granting
          ? `⚠️ This grants complete administrative control of StUsdsRateSetter to ${usr}.`
          : `⚠️ This removes administrative control of StUsdsRateSetter from ${usr}. Confirm at least one trusted ward remains.`,
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
        ? `Authorise ${usr} to call set() on StUsdsRateSetter. This address will be able to change the stUSDS savings rate, the stability fee, the debt ceiling, and the supply cap within the configured bounds, without further governance approval.`
        : `Remove ${usr} from the list of addresses authorised to call set() on StUsdsRateSetter.`,
      warnings: [
        adding
          ? `⚠️ This lets ${usr} change Sky stUSDS rates and ceilings within the configured bounds.`
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
