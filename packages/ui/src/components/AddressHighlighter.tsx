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

const ADDRESS_REGEX = /(0x[a-fA-F0-9]{40})/g

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
