/**
 * Helpers shared by the Sky PAS (Parallelized Allocation System) decoders.
 *
 * PAS differs from the older Sky/Maker contracts in one way that matters to a
 * signer: its `bytes32` identifiers are **keccak hashes, not right-padded
 * ASCII**. `bytes32ToLabel` in `sky-common.ts` returns `(not ASCII)` for every
 * PAS key, so a raw render gives the signer 32 opaque bytes where they need the
 * name of a rate limit.
 *
 * This module resolves those hashes by **preimage**, never by lookup table of
 * unverifiable claims. A name is only reported when this code has recomputed
 * `keccak256` of the candidate preimage and matched it against the key in the
 * calldata byte for byte. Anything that does not match reports nothing, and the
 * caller states plainly that the key could not be resolved.
 *
 * Provenance of the key names: `sparkdotfi/spark-alm-controller`,
 * `src/MainnetController.sol`, `src/ForeignController.sol`, and the libraries
 * under `src/libraries/`. Composite key construction is
 * `src/RateLimitHelpers.sol`:
 *
 *   makeAddressKey(key, a)           = keccak256(abi.encode(key, a))
 *   makeAddressAddressKey(key, a, b) = keccak256(abi.encode(key, a, b))
 *   makeBytes32Key(key, a)           = keccak256(abi.encode(key, a))
 *   makeUint32Key(key, a)            = keccak256(abi.encode(key, a))
 */

import type { Address, Hex } from 'viem'
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem'
import { formatUnitsLoose } from '../utils/units.js'

/** The largest uint256 — the sentinel PAS uses to mean "no limit". */
export const UINT256_MAX = (1n << 256n) - 1n

/** Seconds in a day, for rendering a per-second refill rate. */
const SECONDS_PER_DAY = 86_400n

/**
 * How a rate-limit key is built from its base name.
 *
 * A `bare` key is `keccak256(name)`. Every other shape appends operands with
 * `abi.encode` before hashing, so resolving one means searching candidate
 * operands and recomputing the hash.
 */
export type RateLimitKeyShape =
  | 'bare'
  | 'address'
  | 'address+address'
  | 'address+uint32'
  | 'bytes32'
  | 'uint32'

/**
 * The denomination of `maxAmount` and `slope` for a key.
 *
 * Present **only** where the controller source fixes the denomination for that
 * key regardless of any runtime value. Absent means the scale cannot be known
 * from calldata, and the decoder must show the raw integer with no scaled view
 * rather than pick a plausible one.
 */
export interface RateLimitDenomination {
  symbol: string
  decimals: number
  /** Why this denomination holds, where it is not obvious from the key name. */
  note?: string
}

export interface RateLimitKeyDefinition {
  /** The exact preimage string, e.g. "LIMIT_USDS_MINT". */
  name: string
  shape: RateLimitKeyShape
  /** What the operand identifies, for display. Omitted for `bare` keys. */
  operand?: string
  denomination?: RateLimitDenomination
  /** What the rate limit governs, in one line. */
  summary: string
}

/**
 * Every rate-limit key name declared by the Spark ALM controllers.
 *
 * Denominations are recorded only where the controller source pins them:
 *
 * - `LIMIT_USDE_MINT` is denominated in **USDC**, not USDe —
 *   `prepareUSDeMint(uint256 usdcAmount)` rate-limits the USDC it approves to
 *   Ethena's minter. A signer reading the key name alone would assume 18
 *   decimals and misread the amount by a factor of 10^12.
 * - `LIMIT_USDS_TO_USDC` is denominated in **USDC** in both swap directions.
 *   The source carries an explicit note that the parameter is 1e6 precision to
 *   match how the PSM handles USDC.
 * - `LIMIT_OTC_SWAP` is normalised to 18 decimals for **every** asset:
 *   `sent18 = amount * 1e18 / 10 ** decimals(assetToSend)`. The scale is
 *   therefore a property of the key, not of the asset it is scoped to.
 * - `LIMIT_SUSDE_COOLDOWN` counts USDe **assets**, not sUSDe shares. Both
 *   `cooldownAssets` and `cooldownShares` decrement it by an asset amount.
 * - `LIMIT_WSTETH_REQUEST_WITHDRAW` counts **stETH**, via
 *   `getStETHByWstETH(amountToRedeem)`, not the wstETH passed in.
 * - `LIMIT_WEETH_DEPOSIT` counts **WETH** — the deposit path unwraps WETH
 *   before it reaches eETH.
 *
 * Keys with an operand are left without a denomination on purpose. Their scale
 * follows the token the key is scoped to, which this table does not record, and
 * an ERC-4626 amount may be denominated in either the vault's shares or its
 * underlying asset depending on the entry point. Guessing there would put a
 * wrong number in front of a signer, so the decoder shows the raw integer and
 * says the scale is undetermined.
 */
export const RATE_LIMIT_KEYS: readonly RateLimitKeyDefinition[] = [
  // --- Bare keys ---
  {
    name: 'LIMIT_USDS_MINT',
    shape: 'bare',
    denomination: { symbol: 'USDS', decimals: 18 },
    summary: 'Mint USDS from the allocation vault into the ALM proxy.',
  },
  {
    name: 'LIMIT_USDS_TO_USDC',
    shape: 'bare',
    denomination: {
      symbol: 'USDC',
      decimals: 6,
      note: 'Denominated in USDC (1e6) in both swap directions, matching the PSM.',
    },
    summary: 'Swap USDS to USDC and back through the PSM.',
  },
  {
    name: 'LIMIT_USDC_TO_CCTP',
    shape: 'bare',
    denomination: { symbol: 'USDC', decimals: 6 },
    summary: 'Total USDC bridged out through CCTP, across all destination domains.',
  },
  {
    name: 'LIMIT_USDC_TO_DOMAIN',
    shape: 'uint32',
    operand: 'CCTP destination domain id',
    denomination: { symbol: 'USDC', decimals: 6 },
    summary: 'USDC bridged out through CCTP to one specific destination domain.',
  },
  {
    name: 'LIMIT_USDE_MINT',
    shape: 'bare',
    denomination: {
      symbol: 'USDC',
      decimals: 6,
      note: 'Denominated in USDC, not USDe — prepareUSDeMint takes a usdcAmount.',
    },
    summary: 'USDC approved to the Ethena minter to mint USDe.',
  },
  {
    name: 'LIMIT_USDE_BURN',
    shape: 'bare',
    denomination: { symbol: 'USDe', decimals: 18 },
    summary: 'USDe approved to the Ethena minter to redeem.',
  },
  {
    name: 'LIMIT_SUSDE_COOLDOWN',
    shape: 'bare',
    denomination: {
      symbol: 'USDe',
      decimals: 18,
      note: 'Counts USDe assets, not sUSDe shares.',
    },
    summary: 'Start the sUSDe cooldown for redemption.',
  },
  {
    name: 'LIMIT_SUPERSTATE_SUBSCRIBE',
    shape: 'bare',
    denomination: { symbol: 'USDC', decimals: 6 },
    summary: 'USDC subscribed into the Superstate USTB fund.',
  },
  {
    name: 'LIMIT_WSTETH_DEPOSIT',
    shape: 'bare',
    denomination: { symbol: 'wstETH', decimals: 18 },
    summary: 'Deposit wstETH.',
  },
  {
    name: 'LIMIT_WSTETH_REQUEST_WITHDRAW',
    shape: 'bare',
    denomination: {
      symbol: 'stETH',
      decimals: 18,
      note: 'Counts stETH via getStETHByWstETH, not the wstETH amount passed in.',
    },
    summary: 'Request a withdrawal from the wstETH withdrawal queue.',
  },
  {
    name: 'LIMIT_WEETH_DEPOSIT',
    shape: 'bare',
    denomination: {
      symbol: 'WETH',
      decimals: 18,
      note: 'The deposit path unwraps WETH before it reaches eETH.',
    },
    summary: 'Deposit WETH through the weETH module.',
  },

  // --- Address-scoped keys ---
  {
    name: 'LIMIT_PSM_DEPOSIT',
    shape: 'address',
    operand: 'asset',
    summary: 'Deposit an asset into a foreign-domain PSM.',
  },
  {
    name: 'LIMIT_PSM_WITHDRAW',
    shape: 'address',
    operand: 'asset',
    summary: 'Withdraw an asset from a foreign-domain PSM.',
  },
  {
    name: 'LIMIT_4626_DEPOSIT',
    shape: 'address',
    operand: 'ERC-4626 vault',
    summary: 'Deposit into one ERC-4626 vault.',
  },
  {
    name: 'LIMIT_4626_WITHDRAW',
    shape: 'address',
    operand: 'ERC-4626 vault',
    summary: 'Withdraw from one ERC-4626 vault.',
  },
  {
    name: 'LIMIT_AAVE_DEPOSIT',
    shape: 'address',
    operand: 'aToken',
    summary: 'Supply into one Aave market.',
  },
  {
    name: 'LIMIT_AAVE_WITHDRAW',
    shape: 'address',
    operand: 'aToken',
    summary: 'Withdraw from one Aave market.',
  },
  {
    name: 'LIMIT_CURVE_DEPOSIT',
    shape: 'address',
    operand: 'Curve pool',
    summary: 'Add liquidity to one Curve pool.',
  },
  {
    name: 'LIMIT_CURVE_SWAP',
    shape: 'address',
    operand: 'Curve pool',
    summary: 'Swap through one Curve pool.',
  },
  {
    name: 'LIMIT_CURVE_WITHDRAW',
    shape: 'address',
    operand: 'Curve pool',
    summary: 'Remove liquidity from one Curve pool.',
  },
  {
    name: 'LIMIT_FARM_DEPOSIT',
    shape: 'address',
    operand: 'farm',
    summary: 'Stake into one farm.',
  },
  {
    name: 'LIMIT_FARM_WITHDRAW',
    shape: 'address',
    operand: 'farm',
    summary: 'Unstake from one farm.',
  },
  {
    name: 'LIMIT_MAPLE_REDEEM',
    shape: 'address',
    operand: 'Maple token',
    summary: 'Request a redemption from one Maple pool.',
  },
  {
    name: 'LIMIT_OTC_SWAP',
    shape: 'address',
    operand: 'exchange',
    denomination: {
      symbol: '18-decimal normalised',
      decimals: 18,
      note: 'Every asset is normalised to 1e18 before the limit is applied, regardless of the asset’s own decimals.',
    },
    summary: 'Send an asset to one OTC exchange counterparty.',
  },
  {
    name: 'LIMIT_SPARK_VAULT_TAKE',
    shape: 'address',
    operand: 'Spark vault',
    summary: 'Take assets from one Spark vault.',
  },
  {
    name: 'LIMIT_WEETH_REQUEST_WITHDRAW',
    shape: 'address',
    operand: 'weETH module',
    denomination: { symbol: 'eETH', decimals: 18 },
    summary: 'Request a withdrawal through the weETH module.',
  },

  // --- Multi-operand keys ---
  {
    name: 'LIMIT_ASSET_TRANSFER',
    shape: 'address+address',
    operand: 'asset and destination',
    summary: 'Transfer one asset to one specific destination address.',
  },
  {
    name: 'LIMIT_LAYERZERO_TRANSFER',
    shape: 'address+uint32',
    operand: 'OFT address and destination endpoint id',
    summary: 'Bridge a token through LayerZero to one destination endpoint.',
  },

  // --- Pool-id scoped keys ---
  {
    name: 'LIMIT_UNISWAP_V4_DEPOSIT',
    shape: 'bytes32',
    operand: 'Uniswap v4 pool id',
    summary: 'Add liquidity to one Uniswap v4 pool.',
  },
  {
    name: 'LIMIT_UNISWAP_V4_WITHDRAW',
    shape: 'bytes32',
    operand: 'Uniswap v4 pool id',
    summary: 'Remove liquidity from one Uniswap v4 pool.',
  },
  {
    name: 'LIMIT_UNISWAP_V4_SWAP',
    shape: 'bytes32',
    operand: 'Uniswap v4 pool id',
    summary: 'Swap through one Uniswap v4 pool.',
  },
]

/**
 * `keccak256` of a key's name — the base hash every shape is built from.
 *
 * Computed from the name string rather than transcribed as a literal, so there
 * is no opportunity for a hash to drift from the name displayed next to it.
 */
export function rateLimitBaseHash(name: string): Hex {
  return keccak256(toHex(name))
}

/**
 * Upper bound of the CCTP destination-domain search.
 *
 * Circle assigns domain ids as a small dense sequence. Searching a bounded
 * range costs a few dozen hashes and cannot produce a false positive — a match
 * is still a recomputed preimage. The bound only limits what can be found.
 */
const CCTP_DOMAIN_SEARCH_MAX = 64

/** A candidate operand address the resolver may test against a composite key. */
export interface KeyOperandCandidate {
  address: Address
  label: string
}

/** A key whose preimage this code recomputed and matched. */
export interface ResolvedRateLimitKey {
  definition: RateLimitKeyDefinition
  /**
   * The matched operands, already rendered for display. Empty for a bare key.
   * Addresses are full and checksummed as supplied by the candidate list.
   */
  operands: string[]
}

/**
 * Resolve a `bytes32` rate-limit key to its name by recomputing its preimage.
 *
 * Bare keys are matched directly. Composite keys are matched by searching the
 * supplied candidate operands and recomputing `keccak256(abi.encode(...))` for
 * each. A returned name is therefore a proof: this code produced the exact 32
 * bytes in the calldata from a named preimage.
 *
 * Returns null when nothing matches. Null means "not resolved", never "not a
 * real key" — the candidate list is finite and a key scoped to an address this
 * build does not know about is unresolvable here but perfectly valid on chain.
 * Callers must say so rather than implying the key is bogus.
 *
 * Shapes needing an operand this function cannot enumerate — a `bytes32` pool
 * id, a `uint32` domain id, a LayerZero endpoint id — are searched only over
 * the small ranges given below, and otherwise left unresolved.
 */
export function resolveRateLimitKey(
  key: Hex,
  candidates: readonly KeyOperandCandidate[] = []
): ResolvedRateLimitKey | null {
  const target = key.toLowerCase()

  for (const definition of RATE_LIMIT_KEYS) {
    const base = rateLimitBaseHash(definition.name)

    if (definition.shape === 'bare') {
      if (base.toLowerCase() === target) return { definition, operands: [] }
      continue
    }

    if (definition.shape === 'address') {
      for (const candidate of candidates) {
        const hash = keccak256(
          encodeAbiParameters(parseAbiParameters('bytes32, address'), [base, candidate.address])
        )
        if (hash.toLowerCase() === target) {
          return { definition, operands: [`${candidate.address} — ${candidate.label}`] }
        }
      }
      continue
    }

    if (definition.shape === 'address+address') {
      for (const a of candidates) {
        for (const b of candidates) {
          const hash = keccak256(
            encodeAbiParameters(parseAbiParameters('bytes32, address, address'), [
              base,
              a.address,
              b.address,
            ])
          )
          if (hash.toLowerCase() === target) {
            return {
              definition,
              operands: [`${a.address} — ${a.label}`, `${b.address} — ${b.label}`],
            }
          }
        }
      }
      continue
    }

    if (definition.shape === 'uint32') {
      // CCTP domain ids are a small dense enumeration assigned by Circle.
      for (let domain = 0; domain <= CCTP_DOMAIN_SEARCH_MAX; domain++) {
        const hash = keccak256(
          encodeAbiParameters(parseAbiParameters('bytes32, uint32'), [base, domain])
        )
        if (hash.toLowerCase() === target) {
          return { definition, operands: [`domain ${domain}`] }
        }
      }
      continue
    }

    // 'bytes32' (Uniswap v4 pool id) and 'address+uint32' (LayerZero OFT plus
    // endpoint id) have operand spaces too large to search. They stay
    // unresolved, which the caller reports honestly.
  }

  return null
}

/** True for the `type(uint256).max` sentinel PAS treats as "unlimited". */
export function isUnlimitedAmount(value: bigint): boolean {
  return value === UINT256_MAX
}

/**
 * Render a rate-limit amount.
 *
 * The raw integer is always first and always complete. A scaled view is
 * appended only when the key's denomination is known; otherwise the caller is
 * told the scale is undetermined rather than shown a plausible-looking number.
 */
export function formatRateLimitAmount(
  value: bigint,
  denomination?: RateLimitDenomination
): string {
  if (isUnlimitedAmount(value)) {
    return `UNLIMITED (type(uint256).max = ${value.toString()})`
  }
  if (!denomination) {
    return `${value.toString()} (raw integer; denomination not determined from calldata)`
  }
  return `${value.toString()} = ${formatUnitsLoose(value, denomination.decimals, {
    group: true,
  })} ${denomination.symbol}`
}

/**
 * Render a refill slope, which the contract stores as units per second.
 *
 * `RateLimits.getCurrentRateLimit` computes
 * `min(slope * elapsed + lastAmount, maxAmount)`, so the slope is what decides
 * how fast a spent limit comes back. Per second is not a figure a signer can
 * sanity-check, so the per-day equivalent is given alongside the raw value.
 *
 * `context.unlimitedMax` changes what a zero slope means. Paired with a
 * `maxAmount` of `type(uint256).max` it is the required argument for an
 * unlimited key — the contract routes that pair to `setUnlimitedRateLimitData`
 * and rejects any other pair. Calling it "never refills" there would be wrong:
 * an unlimited limit never depletes in the first place.
 */
export function formatRateLimitSlope(
  value: bigint,
  denomination?: RateLimitDenomination,
  context: { unlimitedMax?: boolean } = {}
): string {
  if (value === 0n && context.unlimitedMax) {
    return '0 — required for an unlimited key; the limit does not deplete, so it has nothing to refill'
  }

  if (value === 0n) {
    return '0 (raw integer) — the limit never refills once spent'
  }

  const perDay = value * SECONDS_PER_DAY
  if (!denomination) {
    return (
      `${value.toString()} per second (raw integer; denomination not determined from ` +
      `calldata) = ${perDay.toString()} per day`
    )
  }

  return (
    `${value.toString()} per second = ` +
    `${formatUnitsLoose(perDay, denomination.decimals, { group: true })} ` +
    `${denomination.symbol} per day`
  )
}
