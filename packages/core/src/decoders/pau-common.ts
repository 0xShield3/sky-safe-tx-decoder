/**
 * Types and helpers shared by the Sky PAU (Parallelized Allocation Unit)
 * decoder.
 *
 * PAU replaces the ALMProxy / Controller / RateLimits trio with a diamond-style
 * system. The Controller holds no integration logic. Its `fallback` reads
 * `dispatches[msg.sig]` and delegatecalls a facet with the incoming 4-byte
 * selector REPLACED by a stored delegate selector:
 *
 * ```solidity
 * fallback() external payable {
 *     Dispatch storage dispatch = _getControllerStorage().dispatches[msg.sig];
 *     address facet = dispatch.facet;
 *     require(facet != address(0), CallSelectorNotWired(msg.sig));
 *     facet.delegatecall(abi.encodePacked(dispatch.delegateSelector, msg.data[4:]));
 * }
 * ```
 *
 * Two consequences drive everything in this module:
 *
 * 1. **The call selector is in no ABI.** It is chosen when an integration is
 *    wired and stored as on-chain state. It cannot be derived from the
 *    Controller's source, a facet's source, or a 4-byte database. The mapping
 *    is per-Controller: eight Controllers exist and each carries its own.
 * 2. **The argument bytes pass through unchanged.** `msg.data[4:]` is forwarded
 *    verbatim, so the argument types of a call selector are exactly those of
 *    its delegate function. Decoding is exact once the dispatch is known, and
 *    the re-encode check applies normally.
 *
 * This module holds the table shape, the lookup, the comparison the live check
 * runs, and the domain rendering. The table itself is generated — see
 * `pau-dispatch-table.ts` and `scripts/generate-pau-dispatch.mjs`.
 */

import type { AbiFunction, Address, Hex } from 'viem'
import { formatUnitsLoose } from '../utils/units.js'
import { getKnownTokenDecimals } from '../utils/token-decimals.js'
import { CONTRACTS_BY_NETWORK } from '../contracts/index.js'

/**
 * One frozen wire: a Controller call selector and everything it dispatches to.
 *
 * `callSelector` is what appears in the calldata a signer is asked to approve.
 * `delegateSelector` is what actually executes. They differ, and both are
 * always rendered in full.
 */
export interface PauWire {
  /** The 4-byte selector the Controller is called with. */
  callSelector: Hex
  /** The facet the Controller delegatecalls. */
  facet: Address
  /** Contract name of the facet, from its Sourcify verification. */
  facetName: string | null
  /** The 4-byte selector the facet is delegatecalled with. */
  delegateSelector: Hex
  /** Canonical signature of the facet function, e.g. `setMaxSlippage(address,uint256)`. */
  signature: string
  stateMutability: string
  /** The integration this wire belongs to, as stored on the Controller. */
  integrationId: Hex
  /** ASCII rendering of `integrationId`, or null when it is not printable ASCII. */
  integrationLabel: string | null
  /** The facet function's ABI fragment, used to decode the forwarded arguments. */
  abi: AbiFunction
}

/** Every wire frozen for one Controller, and when it was read. */
export interface PauControllerTable {
  controller: Address
  /** Display copy. Never a substitute for the address. */
  label: string
  network: string
  chainId: number
  /** Block the dispatch map was read at. */
  frozenAtBlock: number
  /** ISO date the dispatch map was read, e.g. `2026-08-20`. */
  frozenAtDate: string
  wires: readonly PauWire[]
}

/** A dispatch as the Controller reports it, from `getDispatch`/`getDispatches`. */
export interface PauDispatch {
  facet: Address
  delegateSelector: Hex
}

/**
 * One frozen entry that no longer matches the chain.
 *
 * A mismatch is not a decoding failure. The frozen entry would still decode the
 * arguments and still round-trip, under the name of a function that is no
 * longer what executes. That is why a mismatch refuses to decode rather than
 * decoding with a caveat.
 */
export interface PauDispatchMismatch {
  callSelector: Hex
  /** What the frozen table says. */
  frozenFacet: Address
  frozenDelegateSelector: Hex
  frozenSignature: string
  /** What the chain says. `null` when the selector is no longer wired at all. */
  onChainFacet: Address | null
  onChainDelegateSelector: Hex | null
  kind: 'facet' | 'delegate-selector' | 'facet-and-delegate-selector' | 'not-wired'
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Find the frozen table for a Controller address. Case-insensitive. */
export function findPauControllerTable(
  tables: readonly PauControllerTable[],
  controller: string
): PauControllerTable | undefined {
  const wanted = controller.trim().toLowerCase()
  return tables.find(table => table.controller.toLowerCase() === wanted)
}

/** Find the frozen wire for a call selector. Case-insensitive. */
export function findPauWire(
  table: PauControllerTable,
  callSelector: string
): PauWire | undefined {
  const wanted = callSelector.trim().toLowerCase()
  return table.wires.find(wire => wire.callSelector.toLowerCase() === wanted)
}

/**
 * Compare a frozen wire against what the Controller reports now.
 *
 * Returns null when they agree. A facet of `address(0)` means the Controller
 * has no dispatch for the selector, which `fallback` rejects with
 * `CallSelectorNotWired`.
 */
export function comparePauDispatch(
  wire: PauWire,
  onChain: PauDispatch
): PauDispatchMismatch | null {
  const notWired = onChain.facet.toLowerCase() === ZERO_ADDRESS
  const facetDiffers = onChain.facet.toLowerCase() !== wire.facet.toLowerCase()
  const delegateDiffers =
    onChain.delegateSelector.toLowerCase() !== wire.delegateSelector.toLowerCase()

  if (!notWired && !facetDiffers && !delegateDiffers) return null

  return {
    callSelector: wire.callSelector,
    frozenFacet: wire.facet,
    frozenDelegateSelector: wire.delegateSelector,
    frozenSignature: wire.signature,
    onChainFacet: notWired ? null : onChain.facet,
    onChainDelegateSelector: notWired ? null : onChain.delegateSelector,
    kind: notWired
      ? 'not-wired'
      : facetDiffers && delegateDiffers
        ? 'facet-and-delegate-selector'
        : facetDiffers
          ? 'facet'
          : 'delegate-selector',
  }
}

/**
 * Human-readable sentence for one mismatch, with both values in full.
 *
 * Used by the decoder and by the UI banner, so the wording is identical
 * wherever a signer meets it.
 */
export function describePauDispatchMismatch(mismatch: PauDispatchMismatch): string {
  if (mismatch.kind === 'not-wired') {
    return (
      `Call selector ${mismatch.callSelector} is NOT wired on this Controller. The frozen ` +
      `table maps it to ${mismatch.frozenSignature} on facet ${mismatch.frozenFacet} through ` +
      `delegate selector ${mismatch.frozenDelegateSelector}. The Controller reverts this call ` +
      `with CallSelectorNotWired.`
    )
  }
  return (
    `Call selector ${mismatch.callSelector} does not match the frozen table. Frozen: facet ` +
    `${mismatch.frozenFacet}, delegate selector ${mismatch.frozenDelegateSelector}, function ` +
    `${mismatch.frozenSignature}. On chain: facet ${mismatch.onChainFacet}, delegate selector ` +
    `${mismatch.onChainDelegateSelector}.`
  )
}

// --- The frozen-table caveat ------------------------------------------------

/**
 * Opening words of the caveat a decoding carries when nothing has checked the
 * frozen dispatch table against the chain.
 *
 * Exported so a surface that runs the live check can recognise the exact
 * warning and drop it. The web UI does: its verification banner reports
 * freshness in all three states, and leaving this beside a green banner would
 * contradict it. The CLI keeps the caveat, because it makes no network calls
 * and has no banner.
 */
export const PAU_FROZEN_TABLE_CAVEAT_PREFIX =
  'Function names come from a dispatch table frozen at block '

/** The caveat for one frozen table, with its block and date. */
export function pauFrozenTableCaveat(frozenAtBlock: number, frozenAtDate: string): string {
  return (
    `${PAU_FROZEN_TABLE_CAVEAT_PREFIX}${frozenAtBlock} (${frozenAtDate}). Nothing here checked ` +
    `it against the chain. A call selector rewired since that block decodes to the same ` +
    `argument types under a different function name.`
  )
}

/** True for a warning produced by {@link pauFrozenTableCaveat}. */
export function isPauFrozenTableCaveat(warning: string): boolean {
  return warning.includes(PAU_FROZEN_TABLE_CAVEAT_PREFIX)
}

// --- Domain rendering -------------------------------------------------------

const WAD = 10n ** 18n

/**
 * Render a WAD-scaled fraction as a percentage, trimmed to its significant
 * decimals. `999000000000000000` renders as `99.9`.
 */
function wadPercent(value: bigint): string {
  // Percent scaled by 10^5, which covers every value the facet accepts without
  // inventing precision.
  const scaled = (value * 10_000_000n) / WAD
  const whole = scaled / 100_000n
  const fraction = (scaled % 100_000n).toString().padStart(5, '0').replace(/0+$/, '')
  return fraction.length > 0 ? `${whole}.${fraction}` : whole.toString()
}

/** How `setMaxSlippage` reads, and whether it needs a warning. */
export interface MaxSlippageReading {
  /** The full raw integer, always. */
  value: string
  /** What the value means, stated in the facet's own (inverted) convention. */
  meaning: string
  /** Set where the ordinary reading of the number is dangerously wrong. */
  warning?: string
}

/**
 * Facet functions whose `uint256` argument is a max-slippage value, keyed by
 * `<facet contract name>.<canonical signature>`.
 *
 * Both entries were read in the facet source verified on Sourcify. Both compute
 * `expected * maxSlippage / 1e18` as the MINIMUM acceptable result and both
 * require a non-zero value.
 */
export const PAU_MAX_SLIPPAGE_FUNCTIONS = new Set([
  'UniswapV3Facet.setMaxSlippage(address,uint256)',
  'AaveFacet.setMaxSlippage(address,uint256)',
])

/**
 * Read a PAU max-slippage value.
 *
 * The value is INVERTED relative to the usual convention. It is not how much
 * deviation is allowed. It is how close to expected the result must be, scaled
 * to 1e18. The facet source computes
 * `minAmountThreshold = expected * maxSlippage / 1e18` and requires the result
 * to reach it.
 *
 * Both readings of the number fail dangerously, in opposite directions. A
 * signer applying the usual convention reads `999000000000000000` as "99.9%
 * slippage allowed" and waves through a value that is in fact strict, and reads
 * `0` as maximum safety when it is the unconfigured state.
 *
 * `0` is rejected by the facet: `UniswapV3Facet` and `AaveFacet` both
 * `require(maxSlippage != 0, ".../max-slippage-not-set")` before using it.
 */
export function describeMaxSlippage(value: bigint): MaxSlippageReading {
  if (value === 0n) {
    return {
      value: '0',
      meaning: 'unset — operations that read it revert',
      warning:
        '⚠️ maxSlippage 0 does NOT mean zero tolerance. It disables the operations that ' +
        'read it.',
    }
  }

  if (value === WAD) {
    return {
      value: value.toString(),
      meaning: 'the result must equal the expected amount exactly — no slippage allowed',
    }
  }

  if (value > WAD) {
    return {
      value: value.toString(),
      meaning: `requires ${wadPercent(value)}% of the expected amount`,
      warning:
        `⚠️ maxSlippage above 1e18 demands more than the expected amount; every operation ` +
        `that reads it reverts.`,
    }
  }

  return {
    value: value.toString(),
    meaning:
      `the result must be at least ${wadPercent(value)}% of expected ` +
      `(${wadPercent(WAD - value)}% tolerance)`,
  }
}

/**
 * Where a facet function's amount parameter gets its decimals.
 *
 * `token` pins a token address recorded here; `operand` says the amount is
 * denominated in a token named by another parameter of the same call.
 */
type PauDenomination =
  | { kind: 'token'; address: Address; symbol: string }
  | { kind: 'operand'; paramIndex: number; note: string }

/**
 * Amount parameters whose denomination the facet source pins.
 *
 * Keyed by `<facet contract name>.<canonical signature>`. The facet name is
 * part of the key because facet function names collide across facets — three
 * facets in the frozen tables declare `deposit` and two declare `withdraw` —
 * and a denomination is only valid for the facet whose source was read.
 *
 * Recorded only where the facet source names the unit. Every other numeric
 * parameter renders as a raw integer with the scale stated as undetermined —
 * the rule documented in `packages/core/src/utils/token-decimals.ts`.
 *
 * Deliberately absent:
 *
 * - **Every UniswapV3Facet amount.** `addLiquidity` and `removeLiquidity`
 *   denominate `amount0` / `amount1` in the pool's own tokens, which are a
 *   property of the pool contract and are not in the calldata.
 * - **Every AaveFacet amount.** They count units of an aToken named in the
 *   call, and no aToken is in this repository's contract registry.
 * - **`BasinFacet.deposit` `minSharesOut`.** Basin shares, whose decimals are a
 *   property of the Basin contract. This is the same split `PAS.md` records for
 *   `LIMIT_BASIN_DEPOSIT`.
 * - **`BasinFacet.withdraw` `minConversionRate`.** A rate, not an amount.
 */
const PAU_AMOUNT_DENOMINATION: Record<string, Record<number, PauDenomination>> = {
  // USDSFacet.mint(uint256 usdsAmount) / burn(uint256 usdsAmount). The token is
  // USDSFacet.usds(), read through the Grove Controller's wired `usds()` call
  // selector 0x3ca47c53 on 2026-08-20.
  'USDSFacet.mint(uint256)': {
    0: { kind: 'token', address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F', symbol: 'USDS' },
  },
  'USDSFacet.burn(uint256)': {
    0: { kind: 'token', address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F', symbol: 'USDS' },
  },
  // PSMFacet.swapUSDCToUSDS(uint256 usdcAmount) / swapUSDSToUSDC(uint256
  // usdcAmount). Both parameters are the USDC leg, which is why the matching PAS
  // keys LIMIT_USDC_TO_USDS and LIMIT_USDS_TO_USDC both carry 6 decimals. The
  // token is PSMFacet.usdc(), read through the Grove Controller's wired `usdc()`
  // call selector 0xca222cae on 2026-08-20.
  'PSMFacet.swapUSDCToUSDS(uint256)': {
    0: { kind: 'token', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
  },
  'PSMFacet.swapUSDSToUSDC(uint256)': {
    0: { kind: 'token', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
  },
  // BasinFacet.deposit(address basin, address asset, uint256 amount, uint256
  // minSharesOut) and withdraw(address basin, address asset, uint256 maxAmount,
  // uint256 minConversionRate). Both count units of `asset`, which is parameter
  // 1 — NOT parameter 0, which is the Basin.
  'BasinFacet.deposit(address,address,uint256,uint256)': {
    2: { kind: 'operand', paramIndex: 1, note: 'denominated in the asset named by parameter 1' },
  },
  'BasinFacet.withdraw(address,address,uint256,uint256)': {
    2: { kind: 'operand', paramIndex: 1, note: 'denominated in the asset named by parameter 1' },
  },
}

/**
 * Numeric parameters that ARE token amounts but that this build cannot scale.
 *
 * Kept separate from the denominated table so the "scale is undetermined"
 * caveat lands only where a scale would have meant something. A `deadline` is a
 * unix timestamp and a `tokenId` is a position identifier; telling a signer
 * their denomination is undetermined is noise, and slightly wrong.
 *
 * Positional, never by parameter name — the position is fixed by the facet
 * source, and a name comes from an ABI.
 */
const PAU_UNSCALED_AMOUNT: Record<string, Record<number, string>> = {
  // swap(address pool, address tokenIn, uint256 amountIn, uint256 minAmountOut, uint24 tickDelta)
  'UniswapV3Facet.swap(address,address,uint256,uint256,uint24)': {
    2: 'counts units of tokenIn',
    3: 'counts units of the token received',
  },
  // removeLiquidity(address pool, uint256 tokenId, uint128 liquidity, TokenAmounts min, uint256 deadline)
  'UniswapV3Facet.removeLiquidity(address,uint256,uint128,(uint256,uint256),uint256)': {
    2: 'counts Uniswap v3 liquidity units, not tokens',
  },
  // deposit(address basin, address asset, uint256 amount, uint256 minSharesOut)
  'BasinFacet.deposit(address,address,uint256,uint256)': {
    3: 'counts Basin shares, not tokens',
  },
  // AaveFacet.deposit(address aToken, uint256 amount) / withdraw(address aToken, uint256 amount)
  'AaveFacet.deposit(address,uint256)': {
    1: 'counts units of the aToken',
  },
  'AaveFacet.withdraw(address,uint256)': {
    1: 'counts units of the aToken',
  },
}

/** How one decoded numeric parameter reads. */
export interface PauAmountReading {
  /**
   * The scaled rendering, or null when this build applies no scale. The raw
   * integer is always present in it when it is not null.
   */
  scaled: string | null
  /**
   * Why no scale is applied, as a bare clause naming what the value counts.
   * Null where the parameter is not a token amount at all — a `deadline` is a
   * unix timestamp and a `tokenId` is a position identifier, and telling a
   * signer their scale is undetermined is noise.
   */
  note: string | null
}

/**
 * Read one decoded facet-call numeric parameter.
 *
 * A scaled view is produced only where the denomination is source-backed AND
 * the token is in this repository's contract registry with hardcoded decimals.
 * Decimals are never read from the chain.
 *
 * `scaled: null` means the caller emits the bare integer, which keeps the UI's
 * decimals picker live.
 */
export function readPauAmount(
  network: string,
  facetName: string | null,
  signature: string,
  paramIndex: number,
  value: bigint,
  args: readonly unknown[]
): PauAmountReading {
  const key = `${facetName}.${signature}`
  const denomination = PAU_AMOUNT_DENOMINATION[key]?.[paramIndex]

  if (!denomination) {
    const unscaled = PAU_UNSCALED_AMOUNT[key]?.[paramIndex]
    return {
      scaled: null,
      note: unscaled ?? null,
    }
  }

  if (denomination.kind === 'token') {
    const decimals = getKnownTokenDecimals(network, denomination.address)
    if (decimals === null) {
      return {
        scaled: null,
        note: `counts ${denomination.symbol}`,
      }
    }
    return {
      scaled:
        `${value.toString()} = ${formatUnitsLoose(value, decimals, { group: true })} ` +
        `${denomination.symbol}`,
      note: null,
    }
  }

  const operand = args[denomination.paramIndex]
  if (typeof operand !== 'string') {
    return {
      scaled: null,
      note: `is ${denomination.note}`,
    }
  }

  const decimals = getKnownTokenDecimals(network, operand)
  if (decimals === null) {
    return {
      scaled: null,
      note: `is ${denomination.note} (${operand})`,
    }
  }

  // The symbol is safe to show alone: it is looked up from the operand, so a
  // lookalike address not in the registry yields no scaled line at all. The
  // operand itself renders in full as its own parameter, matching PAS.
  const label = knownTokenLabel(network, operand)
  return {
    scaled:
      `${value.toString()} = ${formatUnitsLoose(value, decimals, { group: true })} ` +
      `${label ?? `units of ${operand}`}`,
    note: null,
  }
}

/** Registry label for a token address, or null. The address is always shown too. */
function knownTokenLabel(network: string, address: string): string | null {
  const wanted = address.trim().toLowerCase()
  const contracts = CONTRACTS_BY_NETWORK[network] ?? []
  for (const contract of contracts) {
    if (contract.address.toLowerCase() === wanted) return contract.label
  }
  return null
}

/**
 * Extra notes attached to specific facet functions, keyed by
 * `<facet contract name>.<canonical signature>`.
 *
 * These state semantics the parameter types alone do not carry. Anything not
 * listed renders with its types and values only.
 */
export const PAU_FUNCTION_NOTES: Record<string, string> = {
  'UniswapV3Facet.setMaxSlippage(address,uint256)':
    'maxSlippage is keyed by pool, not token, and applies to addLiquidity and ' +
    'removeLiquidity only — not to swap.',
  'AaveFacet.setMaxSlippage(address,uint256)':
    'maxSlippage is keyed by the aToken, not the underlying token, and applies to deposit.',
  'UniswapV3Facet.setMaxTickDelta(address,uint24)':
    'maxTickDelta is a tick count, not a percentage. It caps how far the pool price may ' +
    'sit from its TWAP for a swap.',
  'UniswapV3Facet.setTWAPSecondsAgo(address,uint32)':
    'twapSecondsAgo is the TWAP lookback window, in seconds.',
  'UniswapV3Facet.setLiquidityLowerTickBound(address,int24)':
    'The bound is a Uniswap v3 tick, not a price, and may be negative.',
  'UniswapV3Facet.setLiquidityUpperTickBound(address,int24)':
    'The bound is a Uniswap v3 tick, not a price, and may be negative.',
  'UniswapV3Facet.swap(address,address,uint256,uint256,uint24)':
    'swap is bounded by maxTickDelta and by minAmountOut in this call, not by maxSlippage.',
}
