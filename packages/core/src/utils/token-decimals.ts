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
 * Standard ERC-20 functions whose amount parameter is denominated in the
 * token's own decimals, and the index of that parameter.
 *
 * Positional rather than by name: parameter names come from an ABI, and an ABI
 * from a third party is exactly the thing this tool declines to trust for
 * anything but presentation. The position of the amount in these signatures is
 * fixed by the ERC-20 standard.
 */
const ERC20_AMOUNT_PARAM: Record<string, number> = {
  'transfer(address,uint256)': 1,
  'transferFrom(address,address,uint256)': 2,
  'approve(address,uint256)': 1,
  'increaseAllowance(address,uint256)': 1,
  'decreaseAllowance(address,uint256)': 1,
  // ERC-4626, SHARE-denominated entry points only. `mint` and `redeem` take
  // shares, which are denominated in the vault's own decimals — the same
  // contract this call is addressed to, so the registry value is the right one.
  //
  // `deposit(assets, receiver)` and `withdraw(assets, receiver, owner)` are
  // deliberately absent. They are denominated in the UNDERLYING ASSET's
  // decimals, not the vault's, and the call is addressed to the vault. Scaling
  // them by the vault's decimals is correct only while the two happen to agree
  // — true for sUSDS over USDS (both 18), false the moment a vault has 18
  // decimals over a 6-decimal asset, where 1 USDC would render as
  // 0.000000000001. Supporting them needs an explicit asset-decimals field, not
  // a guess from the target.
  'mint(uint256,address)': 0,
  'redeem(uint256,address,address)': 0,
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
