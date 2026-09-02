/**
 * Generate the frozen PAU dispatch table, or check the committed one against
 * the chain.
 *
 * A PAU Controller is a dispatcher. Its `fallback` reads
 * `dispatches[msg.sig]`, then delegatecalls a facet with the incoming 4-byte
 * selector REPLACED by a stored delegate selector. The call selector is chosen
 * when an integration is wired and lives only as on-chain state: it appears in
 * no published ABI and in no 4-byte database. Nothing can decode a PAU
 * allocator call without that map.
 *
 * The map is therefore read from the chain and frozen into a committed table,
 * so the decoder stays synchronous, pure, and offline-capable like every other
 * decoder in this repository. The table records the block it was read at.
 *
 * **The table is generated. Hand-editing it is a defect.** A hand-typed
 * selector that is wrong does not fail to decode — it names the wrong function
 * while the argument types still round-trip, which is the exact failure this
 * tool exists to prevent.
 *
 * Two contracts supply the content:
 *
 *   - the Controller, through `integrations()`, which returns every integration
 *     id with its facet and its `(callSelector, delegateSelector)` wires;
 *   - Sourcify, which supplies each facet's verified ABI, resolving a delegate
 *     selector to a function name and its inputs.
 *
 * Plain `eth_call` only. No `eth_getLogs` anywhere: `integrations()` returns the
 * current state directly, and public nodes refuse wide log ranges.
 *
 * Usage:
 *   node scripts/generate-pau-dispatch.mjs             # write the table file
 *   node scripts/generate-pau-dispatch.mjs --check     # diff live vs committed
 *   node scripts/generate-pau-dispatch.mjs --check --issues  # ...and open an issue
 *
 * Requires ETH_RPC_URL. `--issues` additionally requires the `gh` CLI to be
 * authenticated.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// viem is a dependency of the core package, not of the workspace root, so
// resolve it from there rather than adding a root dependency for a script.
// Same approach as packages/ui/src/dev/fixtures/generate.mjs.
const require = createRequire(new URL('../packages/core/package.json', import.meta.url))
const { decodeFunctionResult, toFunctionSelector, toFunctionSignature } = require('viem')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT = path.join(HERE, '..', 'packages', 'core', 'src', 'decoders', 'pau-dispatch-table.ts')

/**
 * Controllers to freeze.
 *
 * Each PAU Controller carries its own dispatch map, so a table covers the
 * instances listed here and no others. `label` is display copy; it never
 * substitutes for the address.
 *
 * Both entries were confirmed active on 2026-08-20: Grove's is driven by Safe
 * 0x9187807e07112359C481870feB58f0c117a29179, and
 * 0x24169Afb34fAe4D4356BC54Bd80319131e35ca38 by Safe
 * 0x3de688267cF099307ABdd85F64D8Efe03D0b2b26. The remaining six Controllers the
 * PAUFactory has deployed are dormant and carry no wires worth freezing.
 */
const CONTROLLERS = [
  {
    address: '0xbf83F5974B932c7D842254042717D6A2706CE5eE',
    label: 'Grove PAU Controller',
    network: 'ethereum',
    chainId: 1,
  },
  {
    address: '0x24169Afb34fAe4D4356BC54Bd80319131e35ca38',
    label: 'PAU Controller 0x24169Afb34fAe4D4356BC54Bd80319131e35ca38',
    network: 'ethereum',
    chainId: 1,
  },
]

/** `integrations()` — the whole dispatch map in one view call. */
const INTEGRATIONS_ABI = [
  {
    type: 'function',
    name: 'integrations',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'integrations_',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'bytes32' },
          {
            name: 'config',
            type: 'tuple',
            components: [
              { name: 'facet', type: 'address' },
              {
                name: 'wires',
                type: 'tuple[]',
                components: [
                  { name: 'callSelector', type: 'bytes4' },
                  { name: 'delegateSelector', type: 'bytes4' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

const INTEGRATIONS_SELECTOR = toFunctionSelector('function integrations()')

const RPC = process.env.ETH_RPC_URL
const CHECK = process.argv.includes('--check')
const OPEN_ISSUES = process.argv.includes('--issues')

/**
 * A transport problem is not a finding.
 *
 * An unreachable RPC or Sourcify must not open an issue claiming the dispatch
 * map changed, and must not fail the run either — a red cross every time a
 * provider hiccups is how a check gets muted.
 */
function bail(message) {
  console.log(`Skipping: ${message}`)
  process.exit(0)
}

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`)
  const body = await response.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

/**
 * Fetch a facet's verified ABI and contract name from Sourcify.
 *
 * The ABI is what turns a delegate selector into a function name and inputs.
 * Without it a wire is four bytes pointing at four other bytes, which tells a
 * signer nothing.
 */
async function fetchFacet(chainId, address) {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,compilation`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Sourcify ${address}: HTTP ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body.abi)) throw new Error(`Sourcify ${address}: no ABI`)
  return {
    abi: body.abi,
    name: body.compilation?.name ?? null,
    fullyQualifiedName: body.compilation?.fullyQualifiedName ?? null,
    match: body.match ?? null,
  }
}

/**
 * Index an ABI by function selector.
 *
 * Overloads collide on name but never on selector, which is why the index is
 * built on the selector the Controller actually delegates to.
 */
function indexBySelector(abi) {
  const index = new Map()
  for (const item of abi) {
    if (item.type !== 'function') continue
    let selector
    try {
      selector = toFunctionSelector(item)
    } catch {
      continue
    }
    index.set(selector.toLowerCase(), item)
  }
  return index
}

/**
 * Render a right-padded ASCII bytes32 integration id as its text label.
 *
 * Returns null unless every non-padding byte is printable ASCII, so a
 * non-textual id is never dressed up as a friendly name. The full bytes32 is
 * emitted either way.
 */
function idLabel(id) {
  const hex = id.slice(2)
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16))
  while (bytes.length > 0 && bytes[bytes.length - 1] === 0) bytes.pop()
  if (bytes.length === 0) return null
  if (bytes.some(byte => byte < 0x20 || byte > 0x7e)) return null
  return String.fromCharCode(...bytes)
}

/** Read one Controller's whole dispatch map at a fixed block. */
async function readController(controller, blockTag) {
  const raw = await rpc('eth_call', [
    { to: controller.address, data: INTEGRATIONS_SELECTOR },
    blockTag,
  ])

  const integrations = decodeFunctionResult({
    abi: INTEGRATIONS_ABI,
    functionName: 'integrations',
    data: raw,
  })

  const facets = new Map()
  const entries = []

  for (const integration of integrations) {
    const facet = integration.config.facet
    if (!facets.has(facet.toLowerCase())) {
      facets.set(facet.toLowerCase(), await fetchFacet(controller.chainId, facet))
    }
    const source = facets.get(facet.toLowerCase())
    const index = indexBySelector(source.abi)

    for (const wire of integration.config.wires) {
      const delegate = wire.delegateSelector.toLowerCase()
      const fn = index.get(delegate)
      if (!fn) {
        // A delegate selector absent from the facet's verified ABI cannot be
        // named or decoded. Recording it as an entry with no function would let
        // the decoder claim coverage it does not have, so it is dropped and
        // reported. The decoder then treats the call selector as unknown.
        console.log(
          `  WARNING: ${controller.address} wire ${wire.callSelector} -> facet ${facet} ` +
            `delegate ${wire.delegateSelector} is not in the facet's verified ABI; omitted`
        )
        continue
      }
      entries.push({
        callSelector: wire.callSelector.toLowerCase(),
        delegateSelector: delegate,
        facet,
        facetName: source.name,
        integrationId: integration.id,
        integrationLabel: idLabel(integration.id),
        signature: toFunctionSignature(fn),
        stateMutability: fn.stateMutability ?? 'nonpayable',
        abi: { type: 'function', name: fn.name, inputs: fn.inputs ?? [], outputs: [], stateMutability: fn.stateMutability ?? 'nonpayable' },
      })
    }
  }

  // Sorted so a regeneration produces a minimal diff and the monitor compares
  // content rather than ordering.
  entries.sort((a, b) => a.callSelector.localeCompare(b.callSelector))
  return entries
}

/** The comparison surface for the monitor: everything a signer is shown. */
function fingerprint(entry) {
  return {
    facet: entry.facet,
    delegateSelector: entry.delegateSelector,
    signature: entry.signature,
    integrationId: entry.integrationId,
  }
}

function sameFingerprint(a, b) {
  return (
    a.facet.toLowerCase() === b.facet.toLowerCase() &&
    a.delegateSelector.toLowerCase() === b.delegateSelector.toLowerCase() &&
    a.signature === b.signature &&
    a.integrationId.toLowerCase() === b.integrationId.toLowerCase()
  )
}

// --- Emitting the table ----------------------------------------------------

const json = value => JSON.stringify(value)

function emitEntry(entry) {
  return [
    '      {',
    `        callSelector: ${json(entry.callSelector)},`,
    `        facet: ${json(entry.facet)},`,
    `        facetName: ${json(entry.facetName)},`,
    `        delegateSelector: ${json(entry.delegateSelector)},`,
    `        signature: ${json(entry.signature)},`,
    `        stateMutability: ${json(entry.stateMutability)},`,
    `        integrationId: ${json(entry.integrationId)},`,
    `        integrationLabel: ${json(entry.integrationLabel)},`,
    `        abi: ${json(entry.abi)},`,
    '      },',
  ].join('\n')
}

function emitController(table) {
  return [
    '  {',
    `    controller: ${json(table.controller)},`,
    `    label: ${json(table.label)},`,
    `    network: ${json(table.network)},`,
    `    chainId: ${table.chainId},`,
    `    frozenAtBlock: ${table.frozenAtBlock},`,
    `    frozenAtDate: ${json(table.frozenAtDate)},`,
    '    wires: [',
    table.wires.map(emitEntry).join('\n'),
    '    ],',
    '  },',
  ].join('\n')
}

function emitFile(tables) {
  return [
    '/**',
    ' * Frozen PAU Controller dispatch tables.',
    ' *',
    ' * GENERATED FILE. Do not edit by hand. Regenerate with:',
    ' *',
    ' *   ETH_RPC_URL=... node scripts/generate-pau-dispatch.mjs',
    ' *',
    ' * Each entry maps a Controller call selector to the facet and facet function',
    ' * the Controller delegatecalls for it. The map is on-chain state, read from',
    ' * `Controller.integrations()` at the block recorded in `frozenAtBlock`, with',
    ' * each delegate selector resolved against the facet ABI verified on Sourcify.',
    ' *',
    ' * A stale entry does not fail to decode. It names the wrong function while the',
    ' * argument types still round-trip. See packages/core/src/decoders/PAU.md.',
    ' */',
    '',
    "import type { PauControllerTable } from './pau-common.js'",
    '',
    'export const PAU_DISPATCH_TABLES: readonly PauControllerTable[] = [',
    tables.map(emitController).join('\n'),
    ']',
    '',
  ].join('\n')
}

// --- Reading the committed table -------------------------------------------

/**
 * Load the committed table by importing the built core package.
 *
 * The monitor must compare the chain against the table the shipped decoder
 * actually uses, not against a re-parse of the source file.
 */
async function loadCommitted() {
  const core = await import('../packages/core/dist/index.js')
  return core.PAU_DISPATCH_TABLES
}

// --- Main -------------------------------------------------------------------

if (!RPC) bail('ETH_RPC_URL is not set')

let blockNumberHex
try {
  blockNumberHex = await rpc('eth_blockNumber', [])
} catch (error) {
  bail(`could not read the current block: ${error.message}`)
}
const blockNumber = parseInt(blockNumberHex, 16)
const readDate = new Date().toISOString().slice(0, 10)

const tables = []
for (const controller of CONTROLLERS) {
  console.log(`${controller.label} ${controller.address} at block ${blockNumber}`)
  let wires
  try {
    wires = await readController(controller, blockNumberHex)
  } catch (error) {
    bail(`could not read ${controller.address}: ${error.message}`)
  }
  console.log(`  ${wires.length} call selectors`)
  tables.push({
    controller: controller.address,
    label: controller.label,
    network: controller.network,
    chainId: controller.chainId,
    frozenAtBlock: blockNumber,
    frozenAtDate: readDate,
    wires,
  })
}

if (!CHECK) {
  fs.writeFileSync(OUTPUT, emitFile(tables))
  console.log(`\nWrote ${path.relative(path.join(HERE, '..'), OUTPUT)}`)
  process.exit(0)
}

// --- Check mode -------------------------------------------------------------

let committed
try {
  committed = await loadCommitted()
} catch (error) {
  bail(`could not load the committed table (build core first): ${error.message}`)
}

const added = []
const changed = []
const removed = []

for (const live of tables) {
  const frozen = committed.find(
    t => t.controller.toLowerCase() === live.controller.toLowerCase()
  )
  if (!frozen) {
    for (const wire of live.wires) added.push({ controller: live.controller, wire })
    continue
  }

  const frozenBySelector = new Map(
    frozen.wires.map(w => [w.callSelector.toLowerCase(), w])
  )

  for (const wire of live.wires) {
    const before = frozenBySelector.get(wire.callSelector)
    if (!before) {
      added.push({ controller: live.controller, wire })
    } else if (!sameFingerprint(fingerprint(before), fingerprint(wire))) {
      changed.push({ controller: live.controller, before, after: wire })
    }
    frozenBySelector.delete(wire.callSelector)
  }

  for (const before of frozenBySelector.values()) {
    removed.push({ controller: live.controller, before })
  }
}

const remaps = changed.length + removed.length

console.log(`\n${added.length} added, ${changed.length} changed, ${removed.length} removed`)

if (added.length === 0 && remaps === 0) {
  console.log('The frozen table matches the chain. Nothing to do.')
  process.exit(0)
}

for (const entry of added) {
  console.log(`  ADDED    ${entry.controller} ${entry.wire.callSelector} ${entry.wire.signature}`)
}
for (const entry of changed) {
  // Every field, not just the signature: a remap to a different function of the
  // same shape leaves the signature identical and shows up only in the facet or
  // the delegate selector.
  console.log(
    `  CHANGED  ${entry.controller} ${entry.after.callSelector}\n` +
      `             frozen:   facet ${entry.before.facet} delegate ${entry.before.delegateSelector} ` +
      `${entry.before.signature} integration ${entry.before.integrationId}\n` +
      `             on chain: facet ${entry.after.facet} delegate ${entry.after.delegateSelector} ` +
      `${entry.after.signature} integration ${entry.after.integrationId}`
  )
}
for (const entry of removed) {
  console.log(`  REMOVED  ${entry.controller} ${entry.before.callSelector} ${entry.before.signature}`)
}

if (!OPEN_ISSUES) process.exit(0)

/**
 * True when an issue already covers this state of the chain, open or closed.
 *
 * Keyed on the block the difference was observed against would open a new issue
 * every day, so the key is the set of affected selectors instead. Closed counts:
 * an issue closed as handled should not be reopened on the next run.
 */
function alreadyReported(key) {
  try {
    const out = execFileSync(
      'gh',
      ['issue', 'list', '--state', 'all', '--search', key, '--json', 'number', '--limit', '1'],
      { encoding: 'utf8' }
    )
    return JSON.parse(out).length > 0
  } catch (error) {
    // Failing closed here would spam. Treat a search failure as "reported" so
    // the run is a no-op rather than a duplicate.
    console.log(`  could not search issues (${error.message}); skipping to avoid duplicates`)
    return true
  }
}

const title =
  remaps > 0
    ? `PAU REMAP DETECTED — ${remaps} frozen dispatch entr${remaps === 1 ? 'y' : 'ies'} no longer match the chain`
    : `PAU dispatch table is missing ${added.length} call selector${added.length === 1 ? '' : 's'}`

// Deduped on the affected selectors, which are stable across runs while the
// difference persists. A later spell adding more selectors changes the key and
// opens a new issue, which is correct: it is new information.
const dedupeKey = [...changed, ...removed]
  .map(e => (e.after ?? e.before).callSelector)
  .concat(added.map(e => e.wire.callSelector))
  .sort()
  .join(' ')

if (alreadyReported(dedupeKey)) {
  console.log('An issue already covers these selectors.')
  process.exit(0)
}

const body = []

if (remaps > 0) {
  body.push(
    '## REMAP DETECTED — update immediately',
    '',
    'A call selector the frozen table already covers now resolves to something else on',
    'chain, or has been removed. Until the table is regenerated the decoder labels these',
    'calls with the OLD facet function. That is not a decoding failure: the argument types',
    'still round-trip, so a signer sees a confident, wrong function name.',
    ''
  )
  for (const entry of changed) {
    body.push(
      `### Changed — call selector \`${entry.after.callSelector}\``,
      '',
      `Controller \`${entry.controller}\``,
      '',
      '| Field | Frozen | On chain |',
      '| --- | --- | --- |',
      `| Facet | \`${entry.before.facet}\` | \`${entry.after.facet}\` |`,
      `| Delegate selector | \`${entry.before.delegateSelector}\` | \`${entry.after.delegateSelector}\` |`,
      `| Function | \`${entry.before.signature}\` | \`${entry.after.signature}\` |`,
      `| Integration id | \`${entry.before.integrationId}\` | \`${entry.after.integrationId}\` |`,
      ''
    )
  }
  for (const entry of removed) {
    body.push(
      `### Removed — call selector \`${entry.before.callSelector}\``,
      '',
      `Controller \`${entry.controller}\``,
      '',
      '| Field | Frozen | On chain |',
      '| --- | --- | --- |',
      `| Facet | \`${entry.before.facet}\` | not wired |`,
      `| Delegate selector | \`${entry.before.delegateSelector}\` | not wired |`,
      `| Function | \`${entry.before.signature}\` | not wired |`,
      `| Integration id | \`${entry.before.integrationId}\` | not wired |`,
      ''
    )
  }
}

if (added.length > 0) {
  body.push(
    '## Additive — regenerate the table to gain coverage',
    '',
    'These call selectors are wired on chain and absent from the frozen table. The decoder',
    'reports them as unknown and marks the call high risk, which is correct but is missing',
    'coverage. No existing entry is affected.',
    '',
    '| Controller | Call selector | Facet | Delegate selector | Function | Integration id |',
    '| --- | --- | --- | --- | --- | --- |'
  )
  for (const entry of added) {
    body.push(
      `| \`${entry.controller}\` | \`${entry.wire.callSelector}\` | \`${entry.wire.facet}\` | ` +
        `\`${entry.wire.delegateSelector}\` | \`${entry.wire.signature}\` | \`${entry.wire.integrationId}\` |`
    )
  }
  body.push('')
}

body.push(
  '## How to fix',
  '',
  '```',
  'ETH_RPC_URL=... node scripts/generate-pau-dispatch.mjs',
  '```',
  '',
  'Then commit `packages/core/src/decoders/pau-dispatch-table.ts`. This workflow never',
  'commits and never auto-updates the table.',
  '',
  `Observed at block ${blockNumber} on ${readDate}.`,
  '',
  'See `packages/core/src/decoders/PAU.md`.'
)

execFileSync('gh', ['issue', 'create', '--title', title, '--body', body.join('\n')], {
  stdio: 'inherit',
})
