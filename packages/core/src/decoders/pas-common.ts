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
 * ## Provenance
 *
 * Key names and their composition come from **`sky-ecosystem/diamond-pau`**,
 * the facets under `src/facets/` and the helper library
 * `src/libraries/RateLimitHelpers.sol`.
 *
 * This is deliberately NOT `sparkdotfi/spark-alm-controller`. The two share a
 * naming convention but differ in ways that silently break resolution:
 *
 * - diamond-pau splits operations spark combines. `LIMIT_USDS_BURN` and
 *   `LIMIT_USDC_TO_USDS` are their own keys here; spark reuses
 *   `LIMIT_USDS_MINT` and `LIMIT_USDS_TO_USDC` for both directions.
 * - **Shapes differ for the same name.** `LIMIT_4626_DEPOSIT` is keyed by two
 *   addresses here and one in spark. `LIMIT_AAVE_DEPOSIT` is keyed by three.
 * - diamond-pau has ten composite shapes to spark's four.
 *
 * A wrong shape produces a hash that matches nothing, so the failure mode is an
 * unresolved key rather than a wrong name. That is the safe direction, but it
 * is still a failure: verify against diamond-pau, not spark, when adding keys.
 */

import type { Address, Hex } from 'viem'
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem'
import { formatUnitsLoose } from '../utils/units.js'

/** The largest uint256 — the sentinel PAS uses to mean "no limit". */
export const UINT256_MAX = (1n << 256n) - 1n

/** Seconds in a day, for rendering a per-second refill rate. */
const SECONDS_PER_DAY = 86_400n

/**
 * Upper bound of the CCTP destination-domain search.
 *
 * Circle assigns domain ids as a small dense sequence. Searching a bounded
 * range costs a few dozen hashes and cannot produce a false positive — a match
 * is still a recomputed preimage. The bound only limits what can be found.
 */
const CCTP_DOMAIN_SEARCH_MAX = 64

/**
 * How a rate-limit key is built from its base name, per
 * `diamond-pau/src/libraries/RateLimitHelpers.sol`.
 *
 * A `bare` key is `keccak256(name)`. Every other shape appends operands with
 * `abi.encode` before hashing, so resolving one means searching candidate
 * operands and recomputing the hash.
 *
 * Only some shapes are searchable — see `SEARCHABLE_SHAPES`.
 */
export type RateLimitKeyShape =
  | 'bare'
  | 'address'
  | 'address+address'
  | 'address+address+address'
  | 'address+bytes32'
  | 'address+uint16+address'
  | 'address+address+bytes32+uint32'
  | 'uint32'

/**
 * Shapes this module can actually search.
 *
 * The rest are declared so an unresolved key can be described accurately, but
 * their operand spaces cannot be enumerated: a `bytes32` pool id is unbounded,
 * and a `uint16` crossed with two address lists is far too large to brute
 * force. Keys of those shapes always report unresolved, with the reason given.
 */
const SEARCHABLE_SHAPES: ReadonlySet<RateLimitKeyShape> = new Set([
  'bare',
  'address',
  'address+address',
  'uint32',
])

/**
 * The denomination of `maxAmount` and `slope` for a key.
 *
 * Present only where the facet source fixes the denomination regardless of any
 * runtime value. Absent means the scale cannot be known from calldata, and the
 * decoder must show the raw integer with no scaled view rather than pick a
 * plausible one.
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
  /** What the operands identify, in order. Omitted for `bare` keys. */
  operand?: string
  /** Fixed denomination, where the facet source pins one. */
  denomination?: RateLimitDenomination
  /**
   * Index of the operand that denominates the amount, where the facet counts
   * units of a token named in the key itself.
   *
   * Set only where the facet source has been read and confirms it. For
   * `LIMIT_BASIN_DEPOSIT` the rate-limited value is `amount` of `asset`, and
   * `asset` is operand 0, so a resolved operand 0 that is a known token in this
   * repository's registry supplies the decimals. That is a source-backed rule,
   * not an inference from the key name.
   */
  denominationOperand?: number
  /** What the rate limit governs, in one line. */
  summary: string
}

/**
 * Every rate-limit key name declared by the diamond-pau facets.
 *
 * Harvested from `src/facets/*` at `master` and cross-checked against live
 * on-chain state for the ten keys Grove has set.
 *
 * **Denominations are recorded only where the facet source has been read.**
 * The four USDS/PSM keys and the two Basin keys below were verified line by
 * line. Every other entry deliberately carries no denomination: its scale
 * follows a token this table does not record, and putting a plausible number in
 * front of a signer is the failure this tool exists to prevent. Those keys
 * render as raw integers with the scale stated as undetermined.
 */
export const RATE_LIMIT_KEYS: readonly RateLimitKeyDefinition[] = [
  // --- USDS facet (verified against src/facets/usds/USDSFacet.sol) ---
  {
    name: 'LIMIT_USDS_MINT',
    shape: 'bare',
    denomination: { symbol: 'USDS', decimals: 18 },
    summary: 'Mint USDS from the allocation vault into the ALM proxy.',
  },
  {
    name: 'LIMIT_USDS_BURN',
    shape: 'bare',
    denomination: { symbol: 'USDS', decimals: 18 },
    summary: 'Burn USDS back into the allocation vault.',
  },

  // --- PSM facet (verified against src/facets/psm/PSMFacet.sol) ---
  {
    name: 'LIMIT_USDS_TO_USDC',
    shape: 'bare',
    denomination: {
      symbol: 'USDC',
      decimals: 6,
      note: 'Denominated in USDC. The facet multiplies by to18ConversionFactor() to reach USDS.',
    },
    summary: 'Swap USDS to USDC through the PSM.',
  },
  {
    name: 'LIMIT_USDC_TO_USDS',
    shape: 'bare',
    denomination: {
      symbol: 'USDC',
      decimals: 6,
      note: 'Denominated in USDC, not USDS.',
    },
    summary: 'Swap USDC to USDS through the PSM.',
  },

  // --- Basin facet (verified against src/facets/basin/BasinFacet.sol) ---
  {
    name: 'LIMIT_BASIN_DEPOSIT',
    shape: 'address+address',
    operand: 'asset, then basin',
    denominationOperand: 0,
    summary: 'Deposit one asset into one Basin.',
  },
  {
    name: 'LIMIT_BASIN_WITHDRAW',
    shape: 'address+address',
    operand: 'asset, then basin',
    denominationOperand: 0,
    summary: 'Withdraw one asset from one Basin.',
  },

  // --- ERC-4626 / ERC-7540 ---
  { name: 'LIMIT_4626_DEPOSIT', shape: 'address+address', operand: 'asset and vault', summary: 'Deposit into one ERC-4626 vault.' },
  { name: 'LIMIT_4626_WITHDRAW', shape: 'address', operand: 'vault', summary: 'Withdraw from one ERC-4626 vault.' },
  { name: 'LIMIT_7540_REQUEST_DEPOSIT', shape: 'address+address', operand: 'asset and vault', summary: 'Request a deposit into one ERC-7540 vault.' },
  { name: 'LIMIT_7540_CLAIM_DEPOSIT', shape: 'address', operand: 'vault', summary: 'Claim a settled ERC-7540 deposit.' },
  { name: 'LIMIT_7540_REQUEST_REDEEM', shape: 'address', operand: 'vault', summary: 'Request a redemption from one ERC-7540 vault.' },
  { name: 'LIMIT_7540_CLAIM_REDEEM', shape: 'address', operand: 'vault', summary: 'Claim a settled ERC-7540 redemption.' },

  // --- Aave ---
  { name: 'LIMIT_AAVE_DEPOSIT', shape: 'address+address+address', operand: 'three addresses', summary: 'Supply into one Aave market.' },
  { name: 'LIMIT_AAVE_WITHDRAW', shape: 'address+address', operand: 'two addresses', summary: 'Withdraw from one Aave market.' },

  // --- Curve ---
  { name: 'LIMIT_CURVE_DEPOSIT', shape: 'address+address', operand: 'two addresses', summary: 'Add liquidity to one Curve pool.' },
  { name: 'LIMIT_CURVE_SWAP', shape: 'address+address', operand: 'two addresses', summary: 'Swap through one Curve pool.' },
  { name: 'LIMIT_CURVE_WITHDRAW', shape: 'address+address', operand: 'two addresses', summary: 'Remove liquidity from one Curve pool.' },

  // --- Uniswap ---
  { name: 'LIMIT_UNISWAP_V3_DEPOSIT', shape: 'address+address', operand: 'two addresses', summary: 'Add liquidity to one Uniswap v3 position.' },
  { name: 'LIMIT_UNISWAP_V3_SWAP', shape: 'address+address', operand: 'two addresses', summary: 'Swap through one Uniswap v3 pool.' },
  { name: 'LIMIT_UNISWAP_V3_WITHDRAW', shape: 'address+address', operand: 'two addresses', summary: 'Remove liquidity from one Uniswap v3 position.' },
  { name: 'LIMIT_UNISWAP_V4_DEPOSIT', shape: 'address+bytes32', operand: 'address and pool id', summary: 'Add liquidity to one Uniswap v4 pool.' },
  { name: 'LIMIT_UNISWAP_V4_SWAP', shape: 'address+bytes32', operand: 'address and pool id', summary: 'Swap through one Uniswap v4 pool.' },
  { name: 'LIMIT_UNISWAP_V4_WITHDRAW', shape: 'address+bytes32', operand: 'address and pool id', summary: 'Remove liquidity from one Uniswap v4 pool.' },

  // --- Centrifuge ---
  { name: 'LIMIT_CENTRIFUGE_CANCEL_DEPOSIT', shape: 'address', operand: 'vault', summary: 'Cancel a pending Centrifuge deposit.' },
  { name: 'LIMIT_CENTRIFUGE_CANCEL_REDEEM', shape: 'address', operand: 'vault', summary: 'Cancel a pending Centrifuge redemption.' },
  { name: 'LIMIT_CENTRIFUGE_CLAIM_CANCEL_DEPOSIT', shape: 'address', operand: 'vault', summary: 'Claim a cancelled Centrifuge deposit.' },
  { name: 'LIMIT_CENTRIFUGE_CLAIM_CANCEL_REDEEM', shape: 'address', operand: 'vault', summary: 'Claim a cancelled Centrifuge redemption.' },
  { name: 'LIMIT_CENTRIFUGE_TRANSFER', shape: 'address+uint16+address', operand: 'address, chain id, address', summary: 'Transfer a Centrifuge position cross-chain.' },

  // --- Ethena ---
  { name: 'LIMIT_ETHENA_MINT', shape: 'bare', summary: 'Mint USDe through the Ethena minter.' },
  { name: 'LIMIT_ETHENA_BURN', shape: 'bare', summary: 'Redeem USDe through the Ethena minter.' },
  { name: 'LIMIT_ETHENA_COOLDOWN', shape: 'bare', summary: 'Start the sUSDe cooldown.' },
  { name: 'LIMIT_ETHENA_UNSTAKE', shape: 'bare', summary: 'Unstake sUSDe after cooldown.' },
  { name: 'LIMIT_ETHENA_SET_DELEGATED_SIGNER', shape: 'bare', summary: 'Set the Ethena delegated signer.' },
  { name: 'LIMIT_ETHENA_REMOVE_DELEGATED_SIGNER', shape: 'bare', summary: 'Remove the Ethena delegated signer.' },

  // --- Farms ---
  { name: 'LIMIT_FARM_DEPOSIT', shape: 'address+address', operand: 'two addresses', summary: 'Stake into one farm.' },
  { name: 'LIMIT_FARM_WITHDRAW', shape: 'address', operand: 'farm', summary: 'Unstake from one farm.' },
  { name: 'LIMIT_FARM_CLAIM_REWARD', shape: 'address', operand: 'farm', summary: 'Claim rewards from one farm.' },

  // --- Maple ---
  { name: 'LIMIT_MAPLE_REQUEST_REDEEM', shape: 'address', operand: 'Maple token', summary: 'Request a redemption from one Maple pool.' },
  { name: 'LIMIT_MAPLE_CANCEL_REDEEM', shape: 'address', operand: 'Maple token', summary: 'Cancel a Maple redemption request.' },

  // --- NFAT ---
  { name: 'LIMIT_NFAT_HALO_ISSUE', shape: 'address+address', operand: 'two addresses', summary: 'Issue against an NFAT Halo position.' },
  { name: 'LIMIT_NFAT_HALO_REPAY_INTEREST', shape: 'address+address', operand: 'two addresses', summary: 'Repay interest on an NFAT Halo position.' },
  { name: 'LIMIT_NFAT_HALO_REPAY_PRINCIPAL', shape: 'address+address', operand: 'two addresses', summary: 'Repay principal on an NFAT Halo position.' },
  { name: 'LIMIT_NFAT_PRIME_SUBSCRIBE', shape: 'address+address', operand: 'two addresses', summary: 'Subscribe to an NFAT Prime position.' },
  { name: 'LIMIT_NFAT_PRIME_WITHDRAW', shape: 'address', operand: 'position', summary: 'Withdraw from an NFAT Prime position.' },
  { name: 'LIMIT_NFAT_PRIME_COLLECT', shape: 'address', operand: 'position', summary: 'Collect from an NFAT Prime position.' },

  // --- OTC ---
  { name: 'LIMIT_OTC_SEND', shape: 'address+address', operand: 'two addresses', summary: 'Send an asset to one OTC counterparty.' },
  { name: 'LIMIT_OTC_CLAIM', shape: 'address+address', operand: 'two addresses', summary: 'Claim an asset from one OTC counterparty.' },

  // --- Other integrations ---
  { name: 'LIMIT_ASSET_TRANSFER', shape: 'address+address', operand: 'asset and destination', summary: 'Transfer one asset to one specific destination.' },
  { name: 'LIMIT_PENDLE_PT_REDEEM', shape: 'address+address', operand: 'two addresses', summary: 'Redeem a Pendle principal token.' },
  { name: 'LIMIT_MERKL_TOGGLE_OPERATOR', shape: 'address+address', operand: 'two addresses', summary: 'Toggle a Merkl claim operator.' },
  { name: 'LIMIT_SPARK_VAULT_TAKE', shape: 'address', operand: 'Spark vault', summary: 'Take assets from one Spark vault.' },
  { name: 'LIMIT_SUPERSTATE_SUBSCRIBE', shape: 'bare', summary: 'Subscribe into the Superstate fund.' },
  { name: 'LIMIT_PSM_DEPOSIT', shape: 'address', operand: 'asset', summary: 'Deposit an asset into a PSM3.' },
  { name: 'LIMIT_PSM_WITHDRAW', shape: 'address', operand: 'asset', summary: 'Withdraw an asset from a PSM3.' },
  { name: 'LIMIT_DAIUSDS_SWAP_DAI_TO_USDS', shape: 'bare', summary: 'Swap DAI to USDS.' },
  { name: 'LIMIT_DAIUSDS_SWAP_USDS_TO_DAI', shape: 'bare', summary: 'Swap USDS to DAI.' },

  // --- Bridging ---
  { name: 'LIMIT_USDC_TO_CCTP', shape: 'bare', summary: 'Total USDC bridged out through CCTP, across all domains.' },
  { name: 'LIMIT_USDC_TO_DOMAIN', shape: 'uint32', operand: 'CCTP destination domain id', summary: 'USDC bridged through CCTP to one destination domain.' },
  { name: 'LIMIT_LAYERZERO_TRANSFER', shape: 'address+address+bytes32+uint32', operand: 'four operands', summary: 'Bridge a token through LayerZero.' },

  // --- Staked ETH ---
  { name: 'LIMIT_WSTETH_DEPOSIT', shape: 'bare', summary: 'Deposit wstETH.' },
  { name: 'LIMIT_WSTETH_REQUEST_WITHDRAW', shape: 'bare', summary: 'Request a wstETH withdrawal.' },
  { name: 'LIMIT_WSTETH_CLAIM_WITHDRAW', shape: 'bare', summary: 'Claim a settled wstETH withdrawal.' },
  { name: 'LIMIT_WEETH_DEPOSIT', shape: 'address+address', operand: 'two addresses', summary: 'Deposit through the weETH module.' },
  { name: 'LIMIT_WEETH_REQUEST_WITHDRAW', shape: 'address+address+address', operand: 'three addresses', summary: 'Request a weETH withdrawal.' },
  { name: 'LIMIT_WEETH_CLAIM_WITHDRAW', shape: 'address', operand: 'module', summary: 'Claim a settled weETH withdrawal.' },
  { name: 'LIMIT_WRAP_PROXY_ETH', shape: 'bare', summary: 'Wrap or unwrap ETH held by the proxy.' },
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

/** A candidate operand address the resolver may test against a composite key. */
export interface KeyOperandCandidate {
  address: Address
  label: string
  /** ERC-20 decimals, where this candidate is a known token. */
  decimals?: number
}

/** A key whose preimage this code recomputed and matched. */
export interface ResolvedRateLimitKey {
  definition: RateLimitKeyDefinition
  /**
   * The matched operands, already rendered for display. Empty for a bare key.
   * Addresses are full and checksummed as supplied by the candidate list.
   */
  operands: string[]
  /**
   * Denomination for this specific key, after applying `denominationOperand`
   * against the matched operands. Falls back to the definition's fixed
   * denomination, and is undefined when neither applies.
   */
  denomination?: RateLimitDenomination
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
 * real key" — the candidate list is finite and a key scoped to a contract this
 * build does not know about is unresolvable here but perfectly valid on chain.
 * Callers must say so rather than implying the key is bogus.
 *
 * Cost: the `address+address` search is quadratic in the candidate list. With
 * the per-network registry at its current size this is a few tens of thousands
 * of hashes in the worst case (an unresolved key, which scans everything), and
 * it short-circuits on a match.
 */
export function resolveRateLimitKey(
  key: Hex,
  candidates: readonly KeyOperandCandidate[] = []
): ResolvedRateLimitKey | null {
  const target = key.toLowerCase()

  for (const definition of RATE_LIMIT_KEYS) {
    if (!SEARCHABLE_SHAPES.has(definition.shape)) continue

    const base = rateLimitBaseHash(definition.name)

    if (definition.shape === 'bare') {
      if (base.toLowerCase() === target) return finish(definition, [], [])
      continue
    }

    if (definition.shape === 'address') {
      for (const candidate of candidates) {
        const hash = keccak256(
          encodeAbiParameters(parseAbiParameters('bytes32, address'), [base, candidate.address])
        )
        if (hash.toLowerCase() === target) return finish(definition, [candidate], [])
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
          if (hash.toLowerCase() === target) return finish(definition, [a, b], [])
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
          return finish(definition, [], [`domain ${domain}`])
        }
      }
      continue
    }
  }

  return null
}

/**
 * Assemble a resolution result, applying `denominationOperand` where the key
 * declares one and the matched operand is a known token.
 */
function finish(
  definition: RateLimitKeyDefinition,
  matched: readonly KeyOperandCandidate[],
  extra: readonly string[]
): ResolvedRateLimitKey {
  const operands = [
    ...matched.map(candidate => `${candidate.address} — ${candidate.label}`),
    ...extra,
  ]

  let denomination = definition.denomination
  if (denomination === undefined && definition.denominationOperand !== undefined) {
    const operand = matched[definition.denominationOperand]
    if (operand && typeof operand.decimals === 'number') {
      denomination = { symbol: operand.label, decimals: operand.decimals }
    }
  }

  return { definition, operands, denomination }
}

/**
 * Why a key of this shape could not be searched, or null when the shape is
 * searchable and the key simply did not match any candidate.
 *
 * Lets the caller tell a signer the difference between "this build does not
 * know the address it is scoped to" and "keys of this shape cannot be resolved
 * here at all".
 */
export function unsearchableShapeReason(shape: RateLimitKeyShape): string | null {
  if (SEARCHABLE_SHAPES.has(shape)) return null
  return `Keys of shape "${shape}" cannot be resolved by search: their operand space is unbounded.`
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
