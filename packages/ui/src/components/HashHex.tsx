/**
 * Renders a hash / hex string for character-by-character verification against a
 * hardware-wallet screen, applying common practices for reading long hex:
 *
 *   - fixed 4-character blocks, alternating white / blue by POSITION (not value)
 *     so the eye can track which block it's on (color-only chunking — no spaces
 *     between blocks, by preference)
 *   - a gap splitting the value into two equal halves
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
    <span className={`inline-flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono tracking-wide ${className}`}>
      <span className="break-all">
        {hasPrefix && <span className="text-gray-200">0x</span>}
        {renderGroups(0, splitAt)}
      </span>
      <span className="break-all">{renderGroups(splitAt, groups.length)}</span>
    </span>
  );
}
