/**
 * Scans free text for Ethereum addresses and replaces them with <Address>
 * components so they pick up Safe-address / built-in / address-book treatment.
 *
 * safeAddress is optional — <Address> reads it from SafeRouteProvider context
 * when not explicitly passed.
 */

import { Address } from './Address';

interface AddressHighlighterProps {
  text: string
  /** Optional override; defaults to the active SafeRouteProvider's safeAddress. */
  safeAddress?: string
  className?: string
}

/**
 * A 20-byte hex value that is not part of a longer hex run.
 *
 * The trailing guard matters. Without it the first 40 hex characters of a
 * `bytes32` match, so a hash rendered in an explanation is split into a
 * highlighted "address" and a remainder — and an address-book label can attach
 * to the first 20 bytes of something that is not an address at all. Every
 * decoder that prints a `bytes32` in its explanation hits that: PAS prints a
 * rate-limit key, PAU prints an integration id.
 *
 * The leading guard is the same rule from the other side.
 */
const ADDRESS_REGEX = /(?<![a-fA-F0-9])(0x[a-fA-F0-9]{40})(?![a-fA-F0-9])/g

export function AddressHighlighter({ text, safeAddress, className = '' }: AddressHighlighterProps) {
  const parts: Array<{ text: string; isAddress: boolean }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = ADDRESS_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.substring(lastIndex, match.index), isAddress: false })
    }
    parts.push({ text: match[1]!, isAddress: true })
    lastIndex = match.index + match[1]!.length
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), isAddress: false })
  }

  return (
    <span className={className}>
      {parts.map((part, idx) =>
        part.isAddress ? (
          <Address key={idx} address={part.text} safeAddress={safeAddress} />
        ) : (
          <span key={idx}>{part.text}</span>
        )
      )}
    </span>
  )
}
