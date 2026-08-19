/**
 * Helpers shared by the Sky / Maker-style contract decoders.
 *
 * These contracts follow the same conventions: `bytes32` identifiers holding
 * right-padded ASCII, rates expressed in basis points, and `rely`/`deny`/
 * `kiss`/`diss` authorisation functions.
 */

import type { Abi, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { classifyReencode, trailingDataWarning } from '../utils/reencode.js'

/**
 * Render a right-padded ASCII bytes32 id as its text label.
 *
 * Returns the label only when every non-padding byte is printable ASCII;
 * otherwise returns a marker, so a non-textual id is never dressed up as a
 * friendly name. Callers must always display the full bytes32 alongside this —
 * the label is a convenience, the bytes are the ground truth.
 */
export function bytes32ToLabel(value: Hex): string {
  const hex = value.slice(2)
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16))
  }

  // Strip right padding
  while (bytes.length > 0 && bytes[bytes.length - 1] === 0) {
    bytes.pop()
  }

  if (bytes.length === 0) return '(empty)'
  if (bytes.some(byte => byte < 0x20 || byte > 0x7e)) return '(not ASCII)'

  return String.fromCharCode(...bytes)
}

/**
 * Render basis points as a percentage string (1 bps = 0.01%)
 */
export function bpsToPercent(bps: bigint): string {
  const whole = bps / 100n
  const fraction = bps % 100n
  return `${whole.toString()}.${fraction.toString().padStart(2, '0')}%`
}

/**
 * Render a RAD-scaled (10^45) value as its whole-token amount.
 *
 * Sky/Maker debt ceilings are expressed in RAD. Only the integer part is shown;
 * the caller displays the exact raw integer as well.
 */
export function radToWholeTokens(value: bigint): string {
  const RAD = 10n ** 45n
  return (value / RAD).toLocaleString('en-US')
}

/**
 * Outcome of a decoder's re-encode self-check.
 *
 * `status` mirrors `ReencodeVerdict`, plus `unverifiable` for the case where
 * re-encoding could not be run at all. Callers map it to a risk level:
 * `mismatch` and `unverifiable` are hard failures, `trailing` is a warning that
 * the parameters are right but do not cover every byte in the call.
 */
export interface ReencodeCheck {
  status: 'exact' | 'trailing' | 'mismatch' | 'unverifiable'
  warnings: string[]
  /** Set only for `trailing` — the bytes past the end of the arguments. */
  trailing?: Hex
  /** Set only for `trailing` — how many bytes those are. */
  extraBytes?: number
}

/**
 * Re-encode a decoded call and byte-compare it against the raw calldata.
 *
 * viem's decoder ignores bytes appended past the end of the encoded arguments,
 * so without this check a transaction carrying extra trailing calldata would
 * render as a clean, ordinary call. Classification is delegated to
 * `classifyReencode` so every surface in this tool agrees on what the bytes
 * mean.
 */
export function checkReencode(
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  data: Hex
): ReencodeCheck {
  let reencoded: Hex
  try {
    reencoded = encodeFunctionData({
      abi,
      functionName,
      args: args as never,
    })
  } catch (error) {
    return {
      status: 'unverifiable',
      warnings: [
        `⚠️ Could not re-encode this call to confirm the decoding is faithful: ${
          error instanceof Error ? error.message : String(error)
        }. Verify the raw calldata by hand before signing.`,
      ],
    }
  }

  const verdict = classifyReencode(data, reencoded)

  if (verdict.kind === 'trailing') {
    return {
      status: 'trailing',
      warnings: [trailingDataWarning(verdict)],
      trailing: verdict.trailing,
      extraBytes: verdict.extraBytes,
    }
  }

  if (verdict.kind === 'mismatch') {
    return {
      status: 'mismatch',
      warnings: [
        '⚠️ DECODED DATA DOES NOT MATCH RAW CALLDATA. Re-encoding the decoded ' +
          'parameters produced different bytes than the transaction contains, ' +
          'which means the display below is not what you would be signing. ' +
          `Re-encoded: ${reencoded} — Raw: ${data}. DO NOT SIGN.`,
      ],
    }
  }

  return { status: 'exact', warnings: [] }
}
