/**
 * Which decimal scale to preselect for a decoded numeric parameter.
 *
 * The amount picker in the UI always shows the raw integer — the ground truth
 * that matches the signed bytes — alongside scaled views. This module decides
 * only which scaled view starts selected. It never changes, hides, or replaces
 * the raw value, and every other scale stays available.
 *
 * The rules are deliberately narrow. A wrong preselected scale is a misleading
 * number shown by default, so a hint is produced only when all of the following
 * hold:
 *
 *   1. The call target is a token in this repository's per-network registry
 *      with a hardcoded `decimals` (verified against the deployed contract when
 *      it was added). Decimals are never read from the chain — see the note on
 *      `NetworkContract.decimals`.
 *   2. The function is a standard ERC-20 entry point, and the parameter is that
 *      function's amount parameter. Matching is positional, so a relabelled ABI
 *      cannot move the hint onto a different parameter.
 *   3. The parameter is an unsigned integer type.
 *
 * Anything outside that yields null and the picker starts on `raw`, exactly as
 * before. In particular this never fires for a router or aggregator call, whose
 * amounts are denominated in tokens named in its parameters rather than in the
 * call target, and never for `permit`, whose `deadline` is a timestamp that
 * would scale into nonsense.
 */

import { CONTRACTS_BY_NETWORK } from '../contracts/index.js'

/**
 * The only functions that preselect a scale, and the index of the amount in
 * each. Kept as small as it can usefully be, on purpose.
 *
 * Every entry here satisfies one rule: **the contract being called is itself
 * the sole denominator of the amount.** A `transfer` or `approve` addressed to
 * USDS moves USDS, in USDS decimals, and there is no second token in the call
 * whose decimals might have been meant instead.
 *
 * Deliberately excluded, and why:
 *
 * - **ERC-4626 vault functions** (`deposit`, `withdraw`, `mint`, `redeem`).
 *   Their amounts are denominated in either the vault's shares or the
 *   underlying asset depending on which function it is, and the call is
 *   addressed to the vault either way. Getting that split right is a judgement
 *   about a second contract's decimals, made from a table that only records the
 *   first. Correct today for sUSDS over USDS because both are 18, wrong the
 *   moment a vault sits over an asset with different decimals. Supporting them
 *   needs an explicit asset-decimals field, not an inference from the target.
 * - **`transferFrom`.** Correct when it fires — it only fires on a direct call
 *   to a registry token, since the hint keys off the call target — but it
 *   offers nothing `transfer` does not, and a narrower surface is worth more
 *   than saving a signer one click.
 * - **Anything on a router, aggregator, or protocol contract.** Those amounts
 *   are denominated in tokens named in the call's parameters, not in the
 *   contract being called. The call-target gate excludes them already; nothing
 *   should ever be added here that reintroduces them.
 *
 * Matching is positional, never by parameter name: names come from an ABI, and
 * a third-party ABI is exactly what this tool declines to trust for anything
 * beyond presentation. The position of the amount in these four signatures is
 * fixed by the ERC-20 standard.
 */
const ERC20_AMOUNT_PARAM: Record<string, number> = {
  'transfer(address,uint256)': 1,
  'approve(address,uint256)': 1,
  'increaseAllowance(address,uint256)': 1,
  'decreaseAllowance(address,uint256)': 1,
}

/** True for unsigned integer Solidity types. */
function isUnsignedInt(type: string): boolean {
  return /^uint(\d*)$/.test(type.trim().toLowerCase())
}

/**
 * Hardcoded decimals for a token address on a network, or null when the address
 * is not a known token. Case-insensitive: callers pass addresses straight from
 * calldata, which is not checksummed.
 */
export function getKnownTokenDecimals(network: string, address: string): number | null {
  const contracts = CONTRACTS_BY_NETWORK[network]
  if (!contracts) return null
  const wanted = address.trim().toLowerCase()
  for (const c of contracts) {
    if (c.category !== 'token') continue
    if (typeof c.decimals !== 'number') continue
    if (c.address.toLowerCase() === wanted) return c.decimals
  }
  return null
}

export interface AmountDecimalsQuery {
  /** Network name, matching the keys of CONTRACTS_BY_NETWORK. */
  network: string
  /** The address this call is made to. */
  to: string
  /** Canonical signature of the decoded function, e.g. `transfer(address,uint256)`. */
  signature: string
  /** Index of the parameter being rendered. */
  paramIndex: number
  /** Solidity type of the parameter being rendered. */
  paramType: string
}

/**
 * The decimal scale to preselect for one decoded parameter, or null to leave
 * the picker on `raw`.
 *
 * Returning null is always safe: it means the signer sees the raw integer and
 * chooses a scale, which is the behaviour this tool had before.
 */
export function getAmountDecimalsHint(query: AmountDecimalsQuery): number | null {
  const { network, to, signature, paramIndex, paramType } = query

  if (!isUnsignedInt(paramType)) return null

  const amountIndex = ERC20_AMOUNT_PARAM[signature.trim()]
  if (amountIndex === undefined || amountIndex !== paramIndex) return null

  return getKnownTokenDecimals(network, to)
}
