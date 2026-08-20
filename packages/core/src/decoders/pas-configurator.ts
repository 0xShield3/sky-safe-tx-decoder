/**
 * Custom decoder for the Sky PAS Configurator
 * (Parallelized Allocation System — the cBEAM entry point)
 *
 * Contract: 0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929 (Ethereum mainnet)
 *
 * Why this decoder exists: not because no ABI is available. The Configurator is
 * verified on Sourcify, so the Sourcify fallback already decodes it in the web
 * UI with correct types and correct values. What that decoding cannot give a
 * signer is **meaning**. A raw `setRateLimit` renders as:
 *
 *   - a 32-byte keccak hash where the signer needs the name of a rate limit,
 *   - a bare integer with no decimals where the signer needs an amount,
 *   - a per-second refill rate where the signer needs "X per day",
 *   - 78 digits of `type(uint256).max` where the signer needs "UNLIMITED".
 *
 * Every one of those is correct output that a signer cannot act on. Closing
 * that gap is the whole job of this decoder. The CLI has no Sourcify fallback,
 * so there this decoder is also the only path to any PAS decoding at all.
 *
 * The ABI below is transcribed from the source verified on Sourcify — exact
 * match on both creation and runtime bytecode, `src/Configurator.sol:
 * Configurator`, solc 0.8.24+commit.e11b9ed9, not a proxy. The deployed
 * contract exposes exactly two state-changing functions, and both are here. It
 * is pinned to one address on one network — this decoder never guesses an ABI
 * from a selector lookup, and every decode is re-encoded and compared against
 * the raw calldata before it is returned.
 *
 * What this decoder deliberately does NOT do: claim whether a call raises or
 * lowers a limit. That depends on the limit's current on-chain value, which is
 * not in the calldata. Saying "this is a decrease" from calldata alone would be
 * a guess, and a decrease is precisely the case PAS permits without a ceiling
 * or a cooldown. The decoder states the values and tells the signer which
 * on-chain reads settle the question.
 *
 * Source: https://github.com/sky-ecosystem/pas
 */

import type { Address, Hex } from 'viem'
import { decodeFunctionData, keccak256, parseAbi } from 'viem'
import type { CustomDecoder, DecodedFunction, DecodedTransactionData } from './types.js'
import { checkReencode } from './sky-common.js'
import {
  formatRateLimitAmount,
  formatRateLimitSlope,
  isUnlimitedAmount,
  resolveRateLimitKey,
  type KeyOperandCandidate,
} from './pas-common.js'
import { CONTRACTS_BY_NETWORK } from '../contracts/index.js'

/**
 * Configurator ABI — the two external state-changing functions.
 *
 * `zzz` and `beamState` are views and cannot appear in a Safe transaction, so
 * they are left out rather than padding the surface this decoder claims.
 */
const PAS_CONFIGURATOR_ABI = parseAbi([
  'function setRateLimit(address rateLimits, bytes32 key, uint256 maxAmount, uint256 slope)',
  'function callControllerAction(address controller, bytes data)',
])

/**
 * Operand candidates for resolving address-scoped rate-limit keys.
 *
 * Drawn from this repository's own per-network contract registry, which is
 * reviewed, hardcoded, and identical for every user. Resolution recomputes the
 * keccak preimage for each candidate, so this list only bounds what *can* be
 * resolved — it can never cause a wrong name to be shown.
 */
function operandCandidates(network: string): KeyOperandCandidate[] {
  const contracts = CONTRACTS_BY_NETWORK[network] ?? []
  return contracts.map(contract => ({
    address: contract.address as Address,
    label: contract.label,
    // Carried so a key that denominates its amount in one of its operands can
    // scale it. The decimals come from this repository's hardcoded table, never
    // from a chain call.
    decimals: contract.decimals,
  }))
}

/**
 * PAS Configurator decoder
 */
export class PASConfiguratorDecoder implements CustomDecoder {
  readonly contractAddress: Address = '0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929'
  readonly contractName = 'PAS Configurator'
  readonly network = 'ethereum'

  canDecode(to: Address, data: Hex): boolean {
    return to.toLowerCase() === this.contractAddress.toLowerCase() && data.length > 10
  }

  decode(data: Hex): DecodedTransactionData {
    const { functionName, args } = decodeFunctionData({
      abi: PAS_CONFIGURATOR_ABI,
      data,
    })

    const decodedArgs = (args ?? []) as readonly unknown[]
    const main = this.decodeFunction(functionName, decodedArgs)

    // Re-encode and byte-compare. viem's decoder ignores bytes appended past
    // the end of the encoded arguments, so without this check a transaction
    // carrying extra trailing calldata would render as a clean, ordinary call.
    const reencodeWarnings = checkReencode(PAS_CONFIGURATOR_ABI, functionName, decodedArgs, data)
    if (reencodeWarnings.length > 0) {
      main.warnings = [...(main.warnings ?? []), ...reencodeWarnings]
      main.riskLevel = 'high'
      return { main, isMulticall: false, generalWarnings: reencodeWarnings }
    }

    return { main, isMulticall: false }
  }

  getSupportedFunctions(): string[] {
    return ['setRateLimit', 'callControllerAction']
  }

  private decodeFunction(functionName: string, args: readonly unknown[]): DecodedFunction {
    switch (functionName) {
      case 'setRateLimit':
        return this.decodeSetRateLimit(args)
      case 'callControllerAction':
        return this.decodeCallControllerAction(args)
      default:
        return this.decodeUnsupported(functionName, args)
    }
  }

  /**
   * Decode setRateLimit(address rateLimits, bytes32 key, uint256 maxAmount, uint256 slope)
   *
   * The routine cBEAM operation. Three of its four parameters are opaque in a
   * raw render, and this is where the gap between "correct" and "actionable"
   * is widest.
   */
  private decodeSetRateLimit(args: readonly unknown[]): DecodedFunction {
    const [rateLimits, key, maxAmount, slope] = args as [Address, Hex, bigint, bigint]

    const resolved = resolveRateLimitKey(key, operandCandidates(this.network))
    // Taken from the resolution, not the definition: a key may denominate its
    // amount in one of its own operands (Basin counts units of `asset`), which
    // is only known once the operands have been recovered by preimage.
    const denomination = resolved?.denomination
    const warnings: string[] = []

    // --- The key ---------------------------------------------------------
    // The full bytes32 stands alone. The resolved name and each operand become
    // their own rows rather than being packed into one value, so a long hash
    // and a long address never share a line and each address can be rendered
    // as an address.
    if (!resolved) {
      warnings.push(
        `⚠️ Rate-limit key ${key} could not be resolved to a name. This build recomputes ` +
          `keccak preimages to identify a key, and none matched — the key may be scoped to a ` +
          `contract this build does not know about. Match it against the rate-limit key ` +
          `registry by hand before signing. Do not sign a key you cannot name.`
      )
    }

    // --- The unlimited sentinel -----------------------------------------
    const unlimitedMax = isUnlimitedAmount(maxAmount)
    if (unlimitedMax && slope === 0n) {
      warnings.push(
        `⚠️ This re-pins the key as UNLIMITED (maxAmount = type(uint256).max, slope = 0). ` +
          `On a key locked unlimited these are the only arguments the contract accepts; any ` +
          `other pair reverts with Configurator/unlimited-incorrect-params. Confirm why an ` +
          `unlimited key is being touched at all — the unlimited keys are the intended ` +
          `emergency-exit paths.`
      )
    } else if (unlimitedMax && slope !== 0n) {
      warnings.push(
        `⚠️ maxAmount is type(uint256).max but slope is not 0. If this key is locked ` +
          `unlimited the call reverts with Configurator/unlimited-incorrect-params. If it is ` +
          `not, this sets an effectively unbounded limit. Verify which case applies before ` +
          `signing.`
      )
    }

    // A zero slope is NOT warned about. It is an ordinary configuration here:
    // governance seeds keys with slope 0 routinely, so warning on it would fire
    // constantly and teach a signer to skip the warning block. The slope value
    // already says what it means inline.

    // --- Fully closing a limit -------------------------------------------
    if (maxAmount === 0n) {
      warnings.push(
        `⚠️ maxAmount is 0. This closes the rate limit completely — every operation gated ` +
          `by this key stops.`
      )
    }

    // Direction and ceiling belong in the explanation, not the warning block.
    // They are true of every setRateLimit call, and a warning that always fires
    // is not a warning.
    const directionNote =
      `\n\nDirection and ceiling are not in the calldata. Read getRateLimitData(key) on ` +
      `${rateLimits}, and getMaxChange / getHop / getInitRateLimits on the BeamState, to ` +
      `confirm whether this raises or lowers the limit and whether it is within bounds.`

    const denominationNote = denomination?.note ? `\n\nNote: ${denomination.note}` : ''
    const scaleNote = denomination
      ? ''
      : `\n\nAmounts are shown as raw integers only. The decimal scale of this key is not ` +
        `determined by the calldata, so no scaled value is shown rather than a possibly ` +
        `wrong one.`

    const summary = resolved
      ? `\n\nWhat the limit governs: ${resolved.definition.summary}`
      : ''

    return {
      name: 'setRateLimit',
      signature: 'setRateLimit(address,bytes32,uint256,uint256)',
      parameters: [
        { name: 'rateLimits', type: 'address', value: rateLimits },
        { name: 'key', type: 'bytes32', value: key },
        {
          name: 'key name',
          type: 'string',
          value: resolved ? resolved.definition.name : 'UNRESOLVED',
        },
        ...(resolved?.operandParts ?? []).map((part, i, all) => ({
          name: all.length > 1 ? `scoped to (${i + 1} of ${all.length})` : 'scoped to',
          type: part.address ? 'address' : 'string',
          value: part.address ? `${part.address}` : part.label,
        })),
        {
          name: 'maxAmount',
          type: 'uint256',
          // When the denomination is known, the annotated string carries the
          // correct scale and the UI's decimals picker is redundant. When it is
          // not known, the bare integer is emitted instead so the picker stays
          // live — the picker only renders an ADDITIONAL scaled view and never
          // replaces the raw value, and an unresolved key is precisely the case
          // where a signer needs to try a scale by hand. The explanation states
          // that the scale is undetermined either way.
          // The unlimited sentinel always keeps its label — 78 digits of
          // type(uint256).max is the one value a picker cannot help with.
          value:
            denomination || unlimitedMax
              ? formatRateLimitAmount(maxAmount, denomination)
              : maxAmount.toString(),
        },
        { name: 'slope', type: 'uint256', value: formatRateLimitSlope(slope, denomination, { unlimitedMax }) },
      ],
      explanation:
        `Set a Sky PAS rate limit through the Configurator (the cBEAM entry point).\n\n` +
        `  • RateLimits contract — ${rateLimits}\n` +
        `  • Key — ${resolved ? resolved.definition.name : 'UNRESOLVED'}\n` +
        `    ${key}\n` +
        `  • maxAmount — ${formatRateLimitAmount(maxAmount, denomination)}\n` +
        `  • slope — ${formatRateLimitSlope(slope, denomination, { unlimitedMax })}` +
        summary +
        denominationNote +
        scaleNote +
        directionNote,
      warnings,
      // High when the key cannot be named — a signer is told to reject a key
      // they cannot match to the registry — and high when an unlimited key is
      // touched at all, since those are the intended emergency-exit paths.
      riskLevel: !resolved || unlimitedMax ? 'high' : 'medium',
    }
  }

  /**
   * Decode callControllerAction(address controller, bytes data)
   *
   * The inner `data` is calldata aimed at a third contract. BeamState authorises
   * it by `keccak256(data)` — `isControllerActionEnabled(keccak256(data),
   * controller)` — so that hash, not the inner function name, is what governs
   * whether the call is permitted. It is shown explicitly.
   *
   * No attempt is made to decode the inner call. This decoder holds no ABI for
   * an arbitrary controller, and inventing one from a selector lookup is
   * exactly what this tool declines to do. The full inner calldata is shown
   * instead so it can be compared against the staged action.
   */
  private decodeCallControllerAction(args: readonly unknown[]): DecodedFunction {
    const [controller, innerData] = args as [Address, Hex]

    const actionHash = keccak256(innerData)
    const innerSelector = innerData.length >= 10 ? innerData.slice(0, 10) : '(no selector)'

    const warnings: string[] = [
      `⚠️ This executes pre-staged calldata against another contract. BeamState authorises ` +
        `it by hash: isControllerActionEnabled(${actionHash}, ${controller}). Confirm that ` +
        `exact hash was staged by a spell or Timelock batch. If it was not, the call reverts ` +
        `with Configurator/not-valid-data.`,
      `⚠️ The inner calldata is NOT decoded here. This build holds no ABI for an arbitrary ` +
        `controller and will not guess one from a selector. Decode the inner call against ` +
        `the controller's own verified ABI and confirm it matches the staged action.`,
    ]

    if (innerData === '0x' || innerData.length < 10) {
      warnings.push(
        `⚠️ The inner calldata carries no 4-byte selector. Confirm this is the staged action ` +
          `and not a malformed or truncated payload.`
      )
    }

    return {
      name: 'callControllerAction',
      signature: 'callControllerAction(address,bytes)',
      parameters: [
        { name: 'controller', type: 'address', value: controller },
        { name: 'data', type: 'bytes', value: innerData },
        { name: 'keccak256(data)', type: 'bytes32', value: actionHash },
        { name: 'inner selector', type: 'bytes4', value: innerSelector },
      ],
      explanation:
        `Execute a pre-staged controller action through the Sky PAS Configurator.\n\n` +
        `  • Controller — ${controller}\n` +
        `  • Authorisation key (keccak256 of the inner calldata) —\n    ${actionHash}\n` +
        `  • Inner selector — ${innerSelector}\n` +
        `  • Inner calldata (full) —\n    ${innerData}\n\n` +
        `The Configurator forwards this calldata to the controller with a plain CALL. It ` +
        `only permits calldata whose keccak256 hash BeamState already holds as an enabled ` +
        `action for that controller, so governance staged this exact byte sequence in ` +
        `advance. Verifying it means matching the hash above against the staged action, and ` +
        `decoding the inner calldata against the controller's own verified ABI.`,
      warnings,
      riskLevel: 'high',
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
      warnings: [
        `Custom decoder for "${functionName}" is not yet implemented. Verify transaction carefully.`,
      ],
      riskLevel: 'medium',
    }
  }
}
