import { describe, it, expect } from 'vitest';
import { formatUnitsLoose, isNumericSolidityType, toBigIntLoose } from './units.js';

describe('isNumericSolidityType', () => {
  it('matches uint/int scalar types', () => {
    for (const t of ['uint', 'uint256', 'uint128', 'int', 'int256', 'UINT256']) {
      expect(isNumericSolidityType(t)).toBe(true);
    }
  });
  it('rejects non-scalar / non-numeric types', () => {
    for (const t of ['uint256[]', 'address', 'bytes32', 'bool', 'string', '']) {
      expect(isNumericSolidityType(t)).toBe(false);
    }
  });
});

describe('toBigIntLoose', () => {
  it('accepts bigint, integer number, decimal and hex strings', () => {
    expect(toBigIntLoose(1000000n)).toBe(1000000n);
    expect(toBigIntLoose(42)).toBe(42n);
    expect(toBigIntLoose('1000000')).toBe(1000000n);
    expect(toBigIntLoose('0x0f4240')).toBe(1000000n);
    expect(toBigIntLoose('-5')).toBe(-5n);
  });
  it('throws on non-integral or empty input', () => {
    expect(() => toBigIntLoose(1.5)).toThrow();
    expect(() => toBigIntLoose('not-a-number')).toThrow();
    expect(() => toBigIntLoose('')).toThrow();
  });
});

describe('formatUnitsLoose', () => {
  it('scales by decimals (USDC 6dp, ETH 18dp)', () => {
    expect(formatUnitsLoose('1000000', 6)).toBe('1');
    expect(formatUnitsLoose('1500000', 6)).toBe('1.5');
    expect(formatUnitsLoose('500000000000000000', 18)).toBe('0.5');
    expect(formatUnitsLoose('1000000', 18)).toBe('0.000000000001');
  });
  it('decimals=0 returns the integer unchanged', () => {
    expect(formatUnitsLoose('1000000', 0)).toBe('1000000');
  });
  it('accepts bigint and hex inputs', () => {
    expect(formatUnitsLoose(1000000n, 6)).toBe('1');
    expect(formatUnitsLoose('0x0f4240', 6)).toBe('1');
  });
  it('optionally groups the integer part without losing precision', () => {
    expect(formatUnitsLoose('123456789000000', 6, { group: true })).toBe('123,456,789');
    expect(formatUnitsLoose('1234567890123456789', 18, { group: true })).toBe('1.234567890123456789');
  });
});
