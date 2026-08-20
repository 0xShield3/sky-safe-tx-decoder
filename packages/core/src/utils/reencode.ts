/**
 * Classification of a re-encode check.
 *
 * Every decoding this tool displays is re-encoded and compared against the raw
 * calldata. That comparison has three meaningfully different outcomes, and
 * collapsing them costs a signer real information:
 *
 *   exact     — the decoded parameters reproduce the calldata byte for byte.
 *   trailing  — the decoded parameters reproduce a PREFIX of the calldata
 *               exactly, and bytes remain after it. The displayed parameters
 *               are correct; there are bytes in the call they do not cover.
 *   mismatch  — anything else. The displayed parameters are not what would be
 *               signed.
 *
 * `trailing` exists because appending bytes to calldata is always permitted.
 * The EVM imposes no structure on calldata, and a compiler-generated ABI
 * decoder checks that calldata is long ENOUGH for the parameters it reads, not
 * that it is exactly that length. So a call can carry extra bytes and still
 * decode cleanly. Frontends and SDKs use this for attribution tags, and
 * ERC-2771 uses it deliberately to append the original sender.
 *
 * That does NOT make trailing bytes inert in general. A contract sees them if
 * it hashes its own calldata, forwards `msg.data`, or reads the tail via
 * `calldatasize()`. Whether they matter is a property of the function being
 * called, so this module reports the fact and leaves the judgement to the
 * signer rather than guessing.
 *
 * This mirrors the reasoning already applied to `mismatch` vs `unverifiable` in
 * `verify-decoded.ts`: a red "DO NOT SIGN" banner on calls that are fine trains
 * signers to ignore the banner that matters.
 */

import type { Hex } from 'viem'

export type ReencodeVerdict =
  | { kind: 'exact' }
  | { kind: 'trailing'; extraBytes: number; trailing: Hex }
  | { kind: 'mismatch' }

/** 0x followed by an even number of hex digits. */
const WELL_FORMED = /^0x([0-9a-f]{2})*$/

/**
 * Minimum length of a re-encoding that can meaningfully be a prefix: `0x` plus
 * a 4-byte selector.
 *
 * Without this floor, a caller that reports re-encode failure as the sentinel
 * `0x` would have EVERY call classified as `trailing`, because every hex string
 * starts with `0x`. That would turn a hard failure into a soft warning, which
 * is the exact inversion this module must never produce.
 */
const MIN_REENCODED_LENGTH = 10

/**
 * Compare a re-encoding against the raw calldata.
 *
 * The comparison is byte-exact. Only case is normalised — nothing is trimmed,
 * padded, or interpreted. Anything that is not provably `exact` or provably
 * `trailing` is reported as `mismatch`, so an unforeseen shape degrades to the
 * loudest outcome rather than the quietest.
 */
export function classifyReencode(raw: Hex, reencoded: Hex): ReencodeVerdict {
  const a = raw.toLowerCase()
  const b = reencoded.toLowerCase()

  // Malformed input is not evidence of a match. Fail closed.
  if (!WELL_FORMED.test(a) || !WELL_FORMED.test(b)) return { kind: 'mismatch' }

  if (a === b) return { kind: 'exact' }

  // A prefix match is only meaningful once the re-encoding carries a selector.
  if (b.length < MIN_REENCODED_LENGTH) return { kind: 'mismatch' }

  if (a.length > b.length && a.startsWith(b)) {
    const trailing = `0x${a.slice(b.length)}` as Hex
    return { kind: 'trailing', extraBytes: (a.length - b.length) / 2, trailing }
  }

  return { kind: 'mismatch' }
}

/**
 * Warning text for a `trailing` verdict.
 *
 * Shared so every surface words this identically. States what is known, what is
 * not, and what decides it. Never says "DO NOT SIGN" — that phrase is reserved
 * for a real parameter mismatch, and spending it here is what makes signers
 * stop reading it.
 */
export function trailingDataWarning(verdict: { extraBytes: number; trailing: Hex }): string {
  const plural = verdict.extraBytes === 1 ? 'byte' : 'bytes'
  return (
    `⚠️ Extra calldata: ${verdict.extraBytes} ${plural} after the decoded parameters, ` +
    `${verdict.trailing}. The parameters are verified; these bytes are not part of them, and ` +
    `they are included in the hash you sign. Confirm they are expected for this contract.`
  )
}
