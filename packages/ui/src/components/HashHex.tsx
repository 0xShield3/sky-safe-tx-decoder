/**
 * Renders a hash / hex string for character-by-character verification against a
 * hardware-wallet screen, applying common practices for reading long hex:
 *
 *   - fixed 6-character blocks (chunking)
 *   - alternating white / blue color by POSITION (not value), so the eye can
 *     track which block it's on
 *   - a gap splitting the value into two halves, each of which wraps as a whole
 *     unit (a block never straddles two lines)
 *   - monospace + a little letter-spacing for legibility
 *
 * The full value is always rendered in order — never grouped away or truncated.
 */

interface HashHexProps {
  value: string;
  className?: string;
}

const BLOCK = 6;

export function HashHex({ value, className = '' }: HashHexProps) {
  const blocks: string[] = [];
  for (let i = 0; i < value.length; i += BLOCK) {
    blocks.push(value.slice(i, i + BLOCK));
  }
  const splitAt = Math.ceil(blocks.length / 2);

  // Color by global block index so parity carries across the half gap.
  const renderRange = (from: number, to: number) =>
    blocks.slice(from, to).map((block, idx) => {
      const gi = from + idx;
      return (
        <span key={gi} className={gi % 2 === 1 ? 'text-sky-400' : 'text-gray-200'}>
          {block}
        </span>
      );
    });

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-6 font-mono tracking-wide ${className}`}>
      <span className="break-all">{renderRange(0, splitAt)}</span>
      <span className="break-all">{renderRange(splitAt, blocks.length)}</span>
    </span>
  );
}
