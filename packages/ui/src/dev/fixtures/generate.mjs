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

const FIXTURES = [
  {
    nonce: 0,
    name: 'pas-bare-key',
    description:
      'PAS Configurator setRateLimit. Bare key LIMIT_USDS_MINT, which resolves from the name alone and is denominated in USDS (18 decimals).',
    data: setRateLimit(
      '0xcb0537d5e5dba65a8edbac12555995860e5b8e1b70996011edb1ca8173e56d3c',
      5_000_000_000_000_000_000_000_000n,
      57_870_370_370_370_370_370n
    ),
  },
  {
    nonce: 1,
    name: 'pas-unlimited-repin',
    description:
      'PAS Configurator setRateLimit. Two-operand key LIMIT_BASIN_WITHDRAW scoped to USDC and the JTRSY Basin, re-pinned as unlimited. Denomination comes from the resolved asset operand.',
    data: setRateLimit(
      '0xdfd7309f2f1b84a83ada77042d91e79a9cb3daf3ecd4c5335dede65b95c888f5',
      UINT256_MAX,
      0n
    ),
  },
  {
    nonce: 2,
    name: 'pas-aggregate-18dec',
    description:
      'PAS Configurator setRateLimit. LIMIT_UNISWAP_V3_DEPOSIT keyed by the pool alone. This arity meters a 1e18-normalised sum across both pool tokens.',
    data: setRateLimit(
      '0xd3384d5424cd179640223010fed859f38b86b26e5e0b9ee88b87321b98882f57',
      5_000_000_000_000_000_000_000_000n,
      0n
    ),
  },
  {
    nonce: 3,
    name: 'pas-pertoken-6dec',
    description:
      'PAS Configurator setRateLimit. LIMIT_UNISWAP_V3_DEPOSIT keyed by USDC and the same pool. Same key name as nonce 2, but this arity meters raw 6-decimal USDC. The two differ by a factor of 10^12.',
    data: setRateLimit(
      '0x71efb11b03476e40dcc1ade629d360114fcbf838d70a3211270f69414ba9a187',
      5_000_000_000_000n,
      0n
    ),
  },
  {
    nonce: 4,
    name: 'pas-unresolved-key',
    description:
      'PAS Configurator setRateLimit with a key that matches no known preimage. Shows the unresolved rendering: full bytes32, no scaled amount, high risk.',
    data: setRateLimit(`0x${'11'.repeat(32)}`, 1_000_000_000n, 100n),
  },
  {
    nonce: 5,
    name: 'pas-controller-action',
    description:
      'PAS Configurator callControllerAction. The inner calldata is not decoded; the keccak256 hash BeamState authorises on is surfaced instead.',
    data: encodeFunctionData({
      abi: ABI,
      functionName: 'callControllerAction',
      args: [CONTROLLER, '0x140aad6a0000000000000000000000000000000000000000000000000000000000000001'],
    }),
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
