/**
 * Tests for the re-encode classifier.
 *
 * The property that matters most is the last describe block: `trailing` must be
 * unreachable whenever any byte of the arguments differs. If that ever breaks,
 * a wrong parameter would be presented to a signer under a soft warning instead
 * of a hard one.
 */

import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import { classifyReencode, trailingDataWarning } from './reencode.js';

/** A realistic re-encoding: selector + one 32-byte word. */
const ENCODED: Hex =
  '0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('classifyReencode', () => {
  it('should report an exact byte-for-byte match', () => {
    expect(classifyReencode(ENCODED, ENCODED)).toEqual({ kind: 'exact' });
  });

  it('should ignore case differences only', () => {
    expect(classifyReencode(ENCODED.toUpperCase().replace('0X', '0x') as Hex, ENCODED)).toEqual({
      kind: 'exact',
    });
  });

  it('should report appended bytes as trailing, with an exact count', () => {
    const verdict = classifyReencode((ENCODED + 'deadbeef') as Hex, ENCODED);

    expect(verdict).toEqual({
      kind: 'trailing',
      extraBytes: 4,
      trailing: '0xdeadbeef',
    });
  });

  it('should count a single appended byte', () => {
    const verdict = classifyReencode((ENCODED + 'ff') as Hex, ENCODED);
    expect(verdict).toMatchObject({ kind: 'trailing', extraBytes: 1, trailing: '0xff' });
  });

  it('should report a changed argument byte as a mismatch, not trailing', () => {
    const flipped = (ENCODED.slice(0, -1) + '6') as Hex;
    expect(classifyReencode(flipped, ENCODED)).toEqual({ kind: 'mismatch' });
  });

  it('should report raw shorter than re-encoded as a mismatch', () => {
    expect(classifyReencode(ENCODED.slice(0, -2) as Hex, ENCODED)).toEqual({ kind: 'mismatch' });
  });

  it('should report a differing selector as a mismatch', () => {
    const other = ('0xdeadbeef' + ENCODED.slice(10)) as Hex;
    expect(classifyReencode(other, ENCODED)).toEqual({ kind: 'mismatch' });
  });
});

describe('classifyReencode — fail-closed guards', () => {
  it('should never classify against the 0x re-encode-failure sentinel as trailing', () => {
    // Every hex string starts with "0x". Without a selector-length floor this
    // would turn a hard failure into a soft warning on every single call.
    expect(classifyReencode(ENCODED, '0x')).toEqual({ kind: 'mismatch' });
  });

  it('should reject a re-encoding shorter than a 4-byte selector', () => {
    expect(classifyReencode(ENCODED, '0x70a082' as Hex)).toEqual({ kind: 'mismatch' });
  });

  it('should reject odd-length hex rather than mis-count bytes', () => {
    expect(classifyReencode((ENCODED + 'a') as Hex, ENCODED)).toEqual({ kind: 'mismatch' });
  });

  it('should reject input without a 0x prefix', () => {
    expect(classifyReencode(ENCODED.slice(2) as Hex, ENCODED)).toEqual({ kind: 'mismatch' });
  });

  it('should reject non-hex characters', () => {
    expect(classifyReencode((ENCODED + 'zz') as Hex, ENCODED)).toEqual({ kind: 'mismatch' });
  });

  it('should treat two empty payloads as exact, but never as trailing', () => {
    expect(classifyReencode('0x', '0x')).toEqual({ kind: 'exact' });
  });
});

describe('classifyReencode — trailing cannot mask a bad parameter', () => {
  // The safety argument for showing parameters under a soft warning: if any
  // argument byte differs, the prefix test fails and the verdict is mismatch.
  it('should report a mismatch when bytes are both changed AND appended', () => {
    const tampered = (ENCODED.slice(0, -1) + '6' + 'deadbeef') as Hex;
    expect(classifyReencode(tampered, ENCODED)).toEqual({ kind: 'mismatch' });
  });

  it('should report a mismatch for every single-nibble change, at any position', () => {
    for (let i = 2; i < ENCODED.length; i++) {
      const original = ENCODED[i]!;
      const replacement = original === '0' ? '1' : '0';
      const mutated = (ENCODED.slice(0, i) + replacement + ENCODED.slice(i + 1)) as Hex;

      // Same length, one nibble different — must never be exact or trailing.
      expect(classifyReencode(mutated, ENCODED)).toEqual({ kind: 'mismatch' });
    }
  });

  it('should still report a mismatch when a suffix is appended to a wrong selector', () => {
    const wrong = ('0xdeadbeef' + ENCODED.slice(10) + 'cafe') as Hex;
    expect(classifyReencode(wrong, ENCODED)).toEqual({ kind: 'mismatch' });
  });
});

describe('trailingDataWarning', () => {
  it('should state the byte count and show the bytes in full', () => {
    const text = trailingDataWarning({ extraBytes: 8, trailing: '0x6a85e1e325afea44' });

    expect(text).toContain('8 bytes');
    expect(text).toContain('0x6a85e1e325afea44');
  });

  it('should stay short enough for a signer to actually read', () => {
    // The mechanism (ABI decoding, ERC-2771) is context, not an instruction.
    // It belongs behind a disclosure in the UI, not in the warning line.
    const text = trailingDataWarning({ extraBytes: 8, trailing: '0x6a85e1e325afea44' });

    expect(text.length).toBeLessThan(260);
    expect(text).not.toContain('ERC-2771');
  });

  it('should never say DO NOT SIGN', () => {
    // Reserved for a real parameter mismatch. Spending it here is what makes
    // signers stop reading it.
    const text = trailingDataWarning({ extraBytes: 8, trailing: '0x6a85e1e325afea44' });
    expect(text).not.toContain('DO NOT SIGN');
  });

  it('should say the parameters shown are correct', () => {
    const text = trailingDataWarning({ extraBytes: 8, trailing: '0x6a85e1e325afea44' });
    expect(text).toContain('parameters are verified');
  });

  it('should use the singular for one byte', () => {
    expect(trailingDataWarning({ extraBytes: 1, trailing: '0xff' })).toContain('1 byte after');
  });
});
