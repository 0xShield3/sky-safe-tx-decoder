/**
 * Check the frozen PAU dispatch table against the chain, for one transaction.
 *
 * The frozen table in `pau-dispatch-table.ts` is a copy of on-chain state. Its
 * failure mode is asymmetric. A stale entry does not fail to decode: the
 * Controller forwards the argument bytes unchanged, so a rewired selector keeps
 * the same argument shape and the decoding still round-trips — under the wrong
 * function name. Showing a signer `swap(...)` when the bytes execute something
 * else is the failure this tool exists to prevent, and no amount of re-encode
 * checking catches it.
 *
 * This module closes that gap where a network is available. It runs ONE
 * `eth_call` to `Controller.getDispatches(bytes4[])` with exactly the selectors
 * the transaction contains, and compares the answer to the frozen entries.
 *
 * Three outcomes, and the caller must render each differently:
 *
 * - **verified** — every frozen entry matches the chain. Say so.
 * - **mismatch** — at least one does not. REFUSE to present the decoding. The
 *   decoded arguments are not trustworthy as a description of what executes.
 * - **unavailable** — no RPC, no network, or a malformed answer. Decode
 *   normally with the frozen-at block stated as a caveat. This is also the
 *   permanent state of the CLI, which makes no network calls.
 *
 * Like the Sourcify fallback, this is an async layer the web UI drives. Nothing
 * here is imported by the synchronous `CustomDecoder` path.
 */

import type { Address, Hex } from 'viem'
import { decodeFunctionData, decodeFunctionResult, encodeFunctionData } from 'viem'
import {
  comparePauDispatch,
  findPauControllerTable,
  findPauWire,
  type PauControllerTable,
  type PauDispatch,
  type PauDispatchMismatch,
} from './pau-common.js'
import { PAU_DISPATCH_TABLES } from './pau-dispatch-table.js'
import { PAU_ADMINISTERED_AGENTS, PAU_BATCH_CALL_SELECTOR } from './pau-agent.js'

/** `getDispatches(bytes4[])` on the Controller. All Controllers expose it. */
const GET_DISPATCHES_ABI = [
  {
    type: 'function',
    name: 'getDispatches',
    stateMutability: 'view',
    inputs: [{ name: 'callSelectors', type: 'bytes4[]' }],
    outputs: [
      {
        name: 'dispatches',
        type: 'tuple[]',
        components: [
          { name: 'facet', type: 'address' },
          { name: 'delegateSelector', type: 'bytes4' },
        ],
      },
    ],
  },
] as const

const BATCH_CALL_ABI = [
  {
    type: 'function',
    name: 'batchCall',
    stateMutability: 'payable',
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'data', type: 'bytes[]' },
      { name: 'values', type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const

/** One Controller and the call selectors a transaction sends it. */
export interface PauVerificationTarget {
  controller: Address
  /** Distinct call selectors, in the order they first appear. Full 4 bytes. */
  callSelectors: Hex[]
}

export type PauVerificationStatus = 'verified' | 'mismatch' | 'unavailable'

export interface PauVerification {
  controller: Address
  status: PauVerificationStatus
  /** Selectors that were compared. */
  callSelectors: Hex[]
  /** Empty unless `status` is `mismatch`. */
  mismatches: PauDispatchMismatch[]
  /** Set when the Controller is in the frozen tables. */
  frozenAtBlock?: number
  frozenAtDate?: string
  /**
   * Selectors the frozen table does not hold. The decoder already reports these
   * as undecodable, so they are carried for the caller's message, not compared.
   */
  unknownSelectors: Hex[]
  /** Why the check could not run, when `status` is `unavailable`. */
  reason?: string
}

/**
 * Which Controllers and selectors a call to a PAU AdministeredAgent would
 * reach. Pure: it reads calldata and the frozen tables, nothing else.
 *
 * Returns an empty array when `to` is not a known AdministeredAgent, when the
 * call is not `batchCall`, or when no target is a Controller in the frozen
 * tables. A Controller the tables do not cover cannot be checked against them,
 * so it is left out — the decoder reports it as undecodable on its own.
 */
export function pauVerificationTargets(
  to: string,
  data: Hex,
  tables: readonly PauControllerTable[] = PAU_DISPATCH_TABLES
): PauVerificationTarget[] {
  const agent = PAU_ADMINISTERED_AGENTS.find(
    candidate => candidate.address.toLowerCase() === to.trim().toLowerCase()
  )
  if (!agent) return []
  if (data.slice(0, 10).toLowerCase() !== PAU_BATCH_CALL_SELECTOR) return []

  let targets: readonly Address[]
  let calls: readonly Hex[]
  try {
    const decoded = decodeFunctionData({ abi: BATCH_CALL_ABI, data })
    const args = (decoded.args ?? []) as readonly unknown[]
    targets = args[0] as readonly Address[]
    calls = args[1] as readonly Hex[]
  } catch {
    return []
  }

  const byController = new Map<string, PauVerificationTarget>()

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    if (!target) continue
    const table = findPauControllerTable(tables, target)
    if (!table) continue

    const call = calls[i] ?? '0x'
    if (call.length < 10) continue
    const selector = call.slice(0, 10).toLowerCase() as Hex

    const key = table.controller.toLowerCase()
    const existing = byController.get(key)
    if (existing) {
      if (!existing.callSelectors.includes(selector)) existing.callSelectors.push(selector)
    } else {
      byController.set(key, { controller: table.controller, callSelectors: [selector] })
    }
  }

  return [...byController.values()]
}

/**
 * Compare the frozen entries for one Controller against the chain.
 *
 * One `eth_call`, with exactly the selectors the transaction contains. Any
 * transport or shape problem yields `unavailable`, never a false `verified` and
 * never a false `mismatch`: a check that reports a mismatch on a network
 * hiccup teaches a signer to ignore the mismatch banner.
 */
export async function verifyPauDispatches(opts: {
  rpcUrl: string
  target: PauVerificationTarget
  tables?: readonly PauControllerTable[]
  signal?: AbortSignal
}): Promise<PauVerification> {
  const { rpcUrl, target, tables = PAU_DISPATCH_TABLES, signal } = opts

  const table = findPauControllerTable(tables, target.controller)
  const base: PauVerification = {
    controller: target.controller,
    status: 'unavailable',
    callSelectors: target.callSelectors,
    mismatches: [],
    unknownSelectors: [],
    ...(table ? { frozenAtBlock: table.frozenAtBlock, frozenAtDate: table.frozenAtDate } : {}),
  }

  if (!table) {
    return { ...base, reason: 'no frozen dispatch table for this Controller' }
  }

  const known = target.callSelectors.filter(selector => findPauWire(table, selector))
  const unknownSelectors = target.callSelectors.filter(selector => !findPauWire(table, selector))

  if (known.length === 0) {
    return {
      ...base,
      unknownSelectors,
      reason: 'no frozen entry among these selectors to check',
    }
  }

  let dispatches: readonly PauDispatch[]
  try {
    const raw = await rpcCall(
      rpcUrl,
      {
        to: table.controller,
        data: encodeFunctionData({
          abi: GET_DISPATCHES_ABI,
          functionName: 'getDispatches',
          args: [known],
        }),
      },
      signal
    )
    if (raw === null) {
      return { ...base, unknownSelectors, reason: 'the RPC endpoint did not answer' }
    }
    dispatches = decodeFunctionResult({
      abi: GET_DISPATCHES_ABI,
      functionName: 'getDispatches',
      data: raw as Hex,
    }) as readonly PauDispatch[]
  } catch (error) {
    return {
      ...base,
      unknownSelectors,
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  if (dispatches.length !== known.length) {
    return {
      ...base,
      unknownSelectors,
      reason:
        `getDispatches returned ${dispatches.length} entries for ${known.length} selectors`,
    }
  }

  const mismatches: PauDispatchMismatch[] = []
  for (let i = 0; i < known.length; i++) {
    const selector = known[i]
    const onChain = dispatches[i]
    if (!selector || !onChain) continue
    const wire = findPauWire(table, selector)
    if (!wire) continue
    const mismatch = comparePauDispatch(wire, onChain)
    if (mismatch) mismatches.push(mismatch)
  }

  return {
    ...base,
    callSelectors: known,
    unknownSelectors,
    mismatches,
    status: mismatches.length > 0 ? 'mismatch' : 'verified',
  }
}

/**
 * One `eth_call`. Returns null on any transport failure, abort, or malformed
 * response, so the caller reports `unavailable` rather than a verdict.
 */
async function rpcCall(
  rpcUrl: string,
  call: { to: string; data: Hex },
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [call, 'latest'],
      }),
      signal,
    })
    if (!response.ok) return null
    const json = (await response.json()) as { result?: unknown }
    return typeof json.result === 'string' ? json.result : null
  } catch {
    return null
  }
}
