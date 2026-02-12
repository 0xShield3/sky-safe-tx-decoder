import { describe, it, expect } from 'vitest'
import { formatHash } from './format.js'

describe('formatHash', () => {
  it('formats hash with lowercase prefix and uppercase hex', () => {
    const hash = '0xaabbccdd11223344556677889900ffeeddccbbaa11223344556677889900ffee'
    const formatted = formatHash(hash as `0x${string}`)

    expect(formatted).toBe('0xAABBCCDD11223344556677889900FFEEDDCCBBAA11223344556677889900FFEE')
    expect(formatted.slice(0, 2)).toBe('0x')
    expect(formatted.slice(2)).toBe(formatted.slice(2).toUpperCase())
  })

  it('handles already formatted hashes', () => {
    const hash = '0xAABBCCDD11223344556677889900FFEEDDCCBBAA11223344556677889900FFEE'
    const formatted = formatHash(hash as `0x${string}`)

    expect(formatted).toBe(hash)
  })

  it('throws on invalid hash without 0x prefix', () => {
    expect(() => formatHash('aabbccdd' as `0x${string}`)).toThrow('Hash must start with 0x prefix')
  })
})
