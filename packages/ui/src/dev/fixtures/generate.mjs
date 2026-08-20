/**
 * Regenerates the fixture calldata in this directory.
 *
 * Run with:  node packages/ui/src/dev/fixtures/generate.mjs
 *
 * The rate-limit key values below were read from the Grove RateLimits contract
 * 0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1 on Ethereum mainnet. They are real
 * keys with real values, wrapped in a fabricated Safe transaction so the
 * decoder's rendering can be inspected without a queued transaction.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// viem is a dependency of the core package, not of the UI package, so resolve
// it from there rather than adding a UI dependency for a one-off script.
const require = createRequire(new URL('../../../../core/package.json', import.meta.url))
const { encodeFunctionData, getAddress, parseAbi } = require('viem')

const HERE = path.dirname(fileURLToPath(import.meta.url))

const ABI = parseAbi([
  'function setRateLimit(address rateLimits, bytes32 key, uint256 maxAmount, uint256 slope)',
  'function callControllerAction(address controller, bytes data)',
])

/** Sentinel Safe address. Not a real Safe, and cannot collide with one. */
const MOCK_SAFE = getAddress('0xfeedfacefeedfacefeedfacefeedfacefeedface')
const CONFIGURATOR = getAddress('0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929')
const RATE_LIMITS = getAddress('0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1')
const CONTROLLER = getAddress('0xbf83F5974B932c7D842254042717D6A2706CE5eE')

const UINT256_MAX = (1n << 256n) - 1n

const setRateLimit = (key, maxAmount, slope) =>
  encodeFunctionData({
    abi: ABI,
    functionName: 'setRateLimit',
    args: [RATE_LIMITS, key, maxAmount, slope],
  })

const LIMIT_USDS_MINT =
  '0xcb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c'

/**
 * Nonces 0 to 3 are the four operations a cBEAM Safe is permitted to perform.
 * Nonces 4 and up exercise decoder behaviour that those four do not reach.
 *
 * Note that an increase and a decrease are the same selector with the same four
 * arguments. Nothing in the calldata distinguishes them: only the current
 * on-chain value does, and that is not in the transaction. The decoder
 * therefore reports the values and does not claim a direction.
 */
const FIXTURES = [
  {
    nonce: 0,
    name: 'pas-increase',
    description:
      'Operation 1 of 4: raise a rate limit. LIMIT_USDS_MINT from its current 5,000,000 USDS to 6,000,000 USDS, with the slope raised to match. Subject to the maxChange ceiling and the hop cooldown.',
    data: setRateLimit(LIMIT_USDS_MINT, 6_000_000_000_000_000_000_000_000n, 69_444_444_444_444_444_444n),
  },
  {
    nonce: 1,
    name: 'pas-decrease',
    description:
      'Operation 2 of 4: lower a rate limit, the de-risk path. LIMIT_USDS_MINT from its current 5,000,000 USDS down to 1,000,000 USDS. Identical calldata shape to nonce 0; only the values differ.',
    data: setRateLimit(LIMIT_USDS_MINT, 1_000_000_000_000_000_000_000_000n, 11_574_074_074_074_074_074n),
  },
  {
    nonce: 2,
    name: 'pas-unlimited-repin',
    description:
      'Operation 3 of 4: re-pin a key locked unlimited. LIMIT_BASIN_WITHDRAW scoped to USDC and the JTRSY Basin. The contract accepts only maxAmount = type(uint256).max with slope = 0 on such a key.',
    data: setRateLimit(
      '0xdfd7309f2f1b84a83ada77042d91e79a9cb3daf3ecd4c5335dede65b95c888f5',
      UINT256_MAX,
      0n
    ),
  },
  {
    nonce: 3,
    name: 'pas-controller-action',
    description:
      'Operation 4 of 4: run a staged controller action. The inner calldata is not decoded; the keccak256 hash BeamState authorises on is surfaced instead.',
    data: encodeFunctionData({
      abi: ABI,
      functionName: 'callControllerAction',
      args: [CONTROLLER, '0x140aad6a0000000000000000000000000000000000000000000000000000000000000001'],
    }),
  },

  // --- Beyond the permitted four: decoder behaviour worth being able to see ---
  {
    nonce: 4,
    name: 'pas-aggregate-18dec',
    description:
      'LIMIT_UNISWAP_V3_DEPOSIT keyed by the pool alone. This arity meters a 1e18-normalised sum across both pool tokens.',
    data: setRateLimit(
      '0xd3384d5424cd179640223010fed859f38b86b26e5e0b9ee88b87321b98882f57',
      5_000_000_000_000_000_000_000_000n,
      0n
    ),
  },
  {
    nonce: 5,
    name: 'pas-pertoken-6dec',
    description:
      'LIMIT_UNISWAP_V3_DEPOSIT keyed by USDC and the same pool. Same key name as nonce 4, but this arity meters raw 6-decimal USDC. The two differ by a factor of 10^12.',
    data: setRateLimit(
      '0x71efb11b03476e40dcc1ade629d360114fcbf838d70a3211270f69414ba9a187',
      5_000_000_000_000n,
      0n
    ),
  },
  {
    nonce: 6,
    name: 'pas-unresolved-key',
    description:
      'A key that matches no known preimage. Shows the unresolved rendering: full bytes32, no scaled amount, high risk.',
    data: setRateLimit(`0x${'11'.repeat(32)}`, 1_000_000_000n, 100n),
  },
  {
    nonce: 7,
    name: 'pas-unlimited-bad-slope',
    description:
      'maxAmount is type(uint256).max but slope is not zero. On a key locked unlimited this reverts; on any other key it sets an effectively unbounded limit.',
    data: setRateLimit(LIMIT_USDS_MINT, UINT256_MAX, 1n),
  },
]

for (const fixture of FIXTURES) {
  const body = {
    description: fixture.description,
    version: '1.3.0',
    transaction: {
      safe: MOCK_SAFE,
      to: CONFIGURATOR,
      value: '0',
      data: fixture.data,
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: String(fixture.nonce),
      // Deliberately not a real safeTxHash. The app recomputes the hash and
      // will report a mismatch, which is the honest outcome for fabricated
      // data. See the dev banner.
      safeTxHash: `0x${'00'.repeat(32)}`,
      isExecuted: false,
      isSuccessful: null,
      confirmations: [],
      dataDecoded: null,
    },
  }
  const file = path.join(HERE, `${fixture.name}.json`)
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`)
  console.log(`nonce ${fixture.nonce}  ${fixture.name}.json`)
}
