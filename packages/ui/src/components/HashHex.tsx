/**
 * Renders a hash / hex string for character-by-character verification against a
 * hardware-wallet screen, applying common practices for reading long hex:
 *
 *   - fixed 4-character groups with whitespace between them (spatial chunking —
 *     not relying on color alone), small enough to hold in working memory
 *   - a larger gap splitting the value into two equal halves
 *   - wrapping only at group / half boundaries, so a group never straddles lines
 *   - alternating white / blue by POSITION (a secondary aid to track groups)
 *   - monospace + letter-spacing for legibility
 *   - optional uppercase to mirror what devices like Ledger display
 *
 * The full value is always rendered in order — never grouped away or truncated.
 */

interface HashHexProps {
  value: string;
  /** Uppercase the hex body (the 0x prefix stays lowercase), matching Ledger. */
  uppercase?: boolean;
  className?: string;
}

const GROUP = 4;

export function HashHex({ value, uppercase = true, className = '' }: HashHexProps) {
  const hasPrefix = /^0x/i.test(value);
  const rawBody = hasPrefix ? value.slice(2) : value;
  const body = uppercase ? rawBody.toUpperCase() : rawBody.toLowerCase();

  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP) {
    groups.push(body.slice(i, i + GROUP));
  }
  const splitAt = Math.ceil(groups.length / 2);

  // Color by global group index so parity carries across the half gap.
  const renderGroups = (from: number, to: number) =>
    groups.slice(from, to).map((group, idx) => {
      const gi = from + idx;
      return (
        <span key={gi} className={gi % 2 === 1 ? 'text-sky-400' : 'text-gray-200'}>
          {group}
        </span>
      );
    });

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono tracking-wider ${className}`}>
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {hasPrefix && <span className="text-gray-200">0x</span>}
        {renderGroups(0, splitAt)}
      </span>
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {renderGroups(splitAt, groups.length)}
      </span>
    </span>
  );
}
