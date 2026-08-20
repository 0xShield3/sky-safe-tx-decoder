/**
 * Development-only mock of the Safe Transaction Service.
 *
 * ## Why this exists
 *
 * A decoder can only be reviewed against a transaction the app can load, and
 * the app loads transactions from the Safe Transaction Service by Safe address
 * and nonce. A contract that has never been called from a Safe therefore has no
 * transaction to inspect, and its decoder cannot be seen rendered at all.
 *
 * This module serves fabricated transactions for one sentinel Safe address so
 * that decoder output can be reviewed before any real transaction exists.
 *
 * ## Why it cannot reach production
 *
 * This is a signing tool. Fabricated transaction data rendered as though it
 * were real would be a serious failure, so the guarantee here is structural
 * rather than a runtime flag:
 *
 * - Nothing imports this module statically. `installMockSafeApi` is reached
 *   only through a dynamic `import()` inside an `import.meta.env.DEV` branch in
 *   `main.tsx`. Vite replaces that expression with `false` in a production
 *   build, the branch is eliminated, and this module is never pulled into the
 *   graph. It produces no chunk.
 * - `installMockSafeApi` additionally refuses to run unless
 *   `import.meta.env.DEV` is true, so importing it by hand still does nothing.
 * - Interception is scoped to one sentinel Safe address. Every other address,
 *   including every real Safe, passes through to the network untouched.
 *
 * `MOCK_MARKER` below is a unique string used to assert the above: a production
 * bundle must not contain it.
 *
 * ## Honest hashes
 *
 * Fixtures carry a zero `safeTxHash`. The app recomputes the hash from the
 * transaction fields and will report a mismatch, which is the correct outcome
 * for fabricated data. Nothing here fakes a passing verification.
 */

import type { SafeApiMultisigTransaction } from '@shield3/sky-safe-core'

/** Unique to this module. A production bundle must not contain it. */
export const MOCK_MARKER = 'SAFE_API_MOCK_FIXTURE_9f3a2c'

/**
 * Sentinel Safe address the mock answers for.
 *
 * Not a real Safe. Chosen so it cannot collide with a deployed one, and so it
 * is recognisable on sight in a URL.
 */
export const MOCK_SAFE_ADDRESS = '0xfeEDfaCeFeEdFaceFEedFACefEEDFaCEfEeDfAce'

/** Global the UI reads to decide whether to show the simulated-data banner. */
declare global {
  interface Window {
    __safeApiMockAddress?: string
  }
}

interface Fixture {
  description: string
  version: string
  transaction: Record<string, unknown>
}

/**
 * Fixtures, eagerly imported so a lookup is synchronous.
 *
 * `import.meta.glob` is a Vite primitive, so these are only bundled when this
 * module is, which in a production build is never.
 */
const FIXTURE_MODULES = import.meta.glob<Fixture>('./fixtures/*.json', {
  eager: true,
  import: 'default',
})

/** Fixtures keyed by the nonce declared inside each file. */
const BY_NONCE = new Map<number, Fixture>()

for (const fixture of Object.values(FIXTURE_MODULES)) {
  const nonce = Number(fixture.transaction.nonce)
  if (Number.isFinite(nonce)) BY_NONCE.set(nonce, fixture)
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** The Safe info shape the client expects, enough for a version lookup. */
function safeInfo() {
  return {
    address: MOCK_SAFE_ADDRESS,
    nonce: BY_NONCE.size,
    threshold: 2,
    owners: [],
    masterCopy: '0x0000000000000000000000000000000000000000',
    modules: [],
    fallbackHandler: '0x0000000000000000000000000000000000000000',
    guard: '0x0000000000000000000000000000000000000000',
    version: '1.3.0',
  }
}

function transactionsFor(nonce: number): SafeApiMultisigTransaction[] {
  const fixture = BY_NONCE.get(nonce)
  return fixture ? [fixture.transaction as unknown as SafeApiMultisigTransaction] : []
}

function allTransactions(): SafeApiMultisigTransaction[] {
  return [...BY_NONCE.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, fixture]) => fixture.transaction as unknown as SafeApiMultisigTransaction)
}

/**
 * Install the interceptor. No-op outside a development build.
 *
 * Wraps `window.fetch` and answers only for URLs naming the sentinel Safe.
 * Anything else is delegated to the original `fetch` unchanged, so a real Safe
 * still reaches the real service even while this is installed.
 */
export function installMockSafeApi(): void {
  if (!import.meta.env.DEV) return
  if (window.__safeApiMockAddress) return

  const realFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

    if (!url.toLowerCase().includes(MOCK_SAFE_ADDRESS.toLowerCase())) {
      return realFetch(input as RequestInfo, init)
    }

    // /api/v1/safes/{address}/  — Safe info, used for the version
    if (/\/safes\/[^/]+\/$/.test(url)) return json(safeInfo())

    // /api/v*/safes/{address}/multisig-transactions/?nonce=N
    const nonceMatch = url.match(/[?&]nonce=(\d+)/)
    if (nonceMatch) {
      const results = transactionsFor(Number(nonceMatch[1]))
      return json({ count: results.length, next: null, previous: null, results })
    }

    // /api/v1/safes/{address}/multisig-transactions/?limit=N  — the list view
    if (url.includes('multisig-transactions')) {
      const results = allTransactions()
      return json({ count: results.length, next: null, previous: null, results })
    }

    return realFetch(input as RequestInfo, init)
  }

  window.__safeApiMockAddress = MOCK_SAFE_ADDRESS

  console.warn(
    `[${MOCK_MARKER}] Safe API mock installed for ${MOCK_SAFE_ADDRESS}. ` +
      `Transactions for that address are fabricated. Every other address is untouched.`
  )
}
