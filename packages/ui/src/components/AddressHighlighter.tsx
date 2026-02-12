/**
 * Component that detects Ethereum addresses in text and highlights the Safe address
 */

interface AddressHighlighterProps {
  text: string
  safeAddress: string
  className?: string
}

export function AddressHighlighter({ text, safeAddress, className = '' }: AddressHighlighterProps) {
  // Regex to match Ethereum addresses (0x followed by 40 hex characters)
  const addressRegex = /(0x[a-fA-F0-9]{40})/g

  const parts: Array<{ text: string; isAddress: boolean; isSafe: boolean }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Find all addresses in the text
  while ((match = addressRegex.exec(text)) !== null) {
    // Add text before the address
    if (match.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, match.index),
        isAddress: false,
        isSafe: false,
      })
    }

    // Add the address
    const address = match[1]
    const isSafe = address.toLowerCase() === safeAddress.toLowerCase()
    parts.push({
      text: address,
      isAddress: true,
      isSafe,
    })

    lastIndex = match.index + address.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      isAddress: false,
      isSafe: false,
    })
  }

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (!part.isAddress) {
          return <span key={idx}>{part.text}</span>
        }

        if (part.isSafe) {
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 px-1 rounded font-mono font-semibold"
              title="This is your Safe address"
            >
              {part.text}
              <span className="text-xs bg-blue-200 px-1 rounded">Your Safe</span>
            </span>
          )
        }

        return (
          <span key={idx} className="font-mono">
            {part.text}
          </span>
        )
      })}
    </span>
  )
}
