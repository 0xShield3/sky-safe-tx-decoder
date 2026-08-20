/**
 * Report rate-limit keys this build cannot resolve.
 *
 * PAS rate-limit keys are keccak hashes. The decoder identifies one by
 * recomputing its preimage, which means it can only name a key whose base name
 * is in `RATE_LIMIT_KEYS` and whose operand addresses are in the contract
 * registry. When governance seeds a key that satisfies neither, the decoder
 * renders an unresolved `bytes32` and marks the transaction high risk. That is
 * the safe behaviour, but it is also a signal that this repository has work to
 * do, and nothing surfaces it today.
 *
 * This script reads every `RateLimitDataSet` event a watched RateLimits
 * contract has ever emitted and runs each distinct key through the real
 * resolver. Anything that comes back null is reported.
 *
 * Checking the chain rather than diffing diamond-pau source is deliberate: it
 * catches a new key name, a new operand address, and a name used at a new
 * arity, without needing to anticipate which of those happened. A source diff
 * would fire for every name the facets declare, including the ones no PAU has
 * ever used.
 *
 * Scanning all history each run keeps this stateless. These contracts hold tens
 * of events, not millions, so there is no last-scanned-block file to commit and
 * nothing to fall out of sync.
 *
 * Usage:
 *   node scripts/check-rate-limit-keys.mjs            # print findings
 *   node scripts/check-rate-limit-keys.mjs --issues   # also open GitHub issues
 *
 * Requires ETH_RPC_URL. `--issues` additionally requires the `gh` CLI to be
 * authenticated.
 */

import { execFileSync } from 'node:child_process'
import { resolveRateLimitKey, CONTRACTS_BY_NETWORK } from '../packages/core/dist/index.js'

/**
 * RateLimits contracts to watch.
 *
 * Add an entry to cover another PAU. `network` selects which contract registry
 * supplies candidate operand addresses, so it must match a key of
 * CONTRACTS_BY_NETWORK.
 */
const WATCH = [
  {
    label: 'Grove PAU',
    network: 'ethereum',
    rateLimits: '0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1',
  },
]

/** keccak256("RateLimitDataSet(bytes32,uint256,uint256,uint256,uint256)") */
const RATE_LIMIT_DATA_SET =
  '0x356822943b80f809508a684c67d901d5c13b6a22161bf07d510e50a6cb727028'

const RPC = process.env.ETH_RPC_URL
const OPEN_ISSUES = process.argv.includes('--issues')

/**
 * A transport problem is not a finding.
 *
 * An unreachable RPC must not open an issue saying a key is unresolved, and
 * must not fail the run either — a red cross every time a provider hiccups is
 * how a check gets muted.
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

function candidatesFor(network) {
  return (CONTRACTS_BY_NETWORK[network] ?? []).map(contract => ({
    address: contract.address,
    label: contract.label,
    decimals: contract.decimals,
  }))
}

/** Decode the non-indexed half of a RateLimitDataSet log. */
function amountsFrom(log) {
  const words = (log.data ?? '0x').slice(2).match(/.{64}/g) ?? []
  return {
    maxAmount: words[0] ? BigInt(`0x${words[0]}`) : 0n,
    slope: words[1] ? BigInt(`0x${words[1]}`) : 0n,
  }
}

/**
 * True when an issue already mentions this key, open or closed.
 *
 * Closed counts: an issue closed as handled or as won't-fix should not be
 * reopened as a new one on the next run.
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

function openIssue(finding) {
  const title = `Unresolved rate-limit key ${finding.key}`
  const body = [
    `The rate-limit key below is set on \`${finding.rateLimits}\` (${finding.label}) but this`,
    `build cannot resolve it to a name, so it renders as an unresolved \`bytes32\` and the`,
    `transaction is marked high risk.`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Key | \`${finding.key}\` |`,
    `| RateLimits | \`${finding.rateLimits}\` |`,
    `| maxAmount | \`${finding.maxAmount}\` |`,
    `| slope | \`${finding.slope}\` |`,
    `| Set in block | ${finding.block} |`,
    `| Transaction | \`${finding.tx}\` |`,
    '',
    `To resolve it, either the base name is missing from \`RATE_LIMIT_KEYS\` or an operand`,
    `address is missing from the network's contract registry. See`,
    `\`packages/core/src/decoders/PAS.md\`.`,
    '',
    `Derive the preimage from the \`sky-ecosystem/diamond-pau\` facet source. The spell that`,
    `set the key is usually the fastest way to find the operands.`,
  ].join('\n')

  execFileSync('gh', ['issue', 'create', '--title', title, '--body', body], { stdio: 'inherit' })
}

if (!RPC) bail('ETH_RPC_URL is not set')

const findings = []

for (const target of WATCH) {
  let logs
  try {
    logs = await rpc('eth_getLogs', [
      {
        address: target.rateLimits,
        topics: [RATE_LIMIT_DATA_SET],
        fromBlock: '0x0',
        toBlock: 'latest',
      },
    ])
  } catch (error) {
    bail(`could not read logs for ${target.label}: ${error.message}`)
  }

  const candidates = candidatesFor(target.network)
  const seen = new Map()
  for (const log of logs) seen.set(log.topics[1].toLowerCase(), log)

  console.log(`${target.label}: ${seen.size} distinct keys ever set`)

  for (const [key, log] of seen) {
    if (resolveRateLimitKey(key, candidates)) continue
    const { maxAmount, slope } = amountsFrom(log)
    findings.push({
      key,
      label: target.label,
      rateLimits: target.rateLimits,
      maxAmount: maxAmount.toString(),
      slope: slope.toString(),
      block: parseInt(log.blockNumber, 16),
      tx: log.transactionHash,
    })
  }
}

if (findings.length === 0) {
  console.log('All keys resolve. Nothing to do.')
  process.exit(0)
}

console.log(`\n${findings.length} unresolved key(s):`)
for (const finding of findings) {
  console.log(`  ${finding.key}  maxAmount=${finding.maxAmount}  block ${finding.block}`)
}

if (!OPEN_ISSUES) process.exit(0)

/**
 * Above this many findings, report once rather than per key.
 *
 * One issue per key is right for the expected case: a spell adds an
 * integration and a handful of keys need adding. It is wrong when a whole
 * unknown contract is added to WATCH, where every key is unresolved and a
 * hundred issues would bury the repository. Those are not duplicates, so the
 * dedupe does not catch them.
 */
const MAX_INDIVIDUAL_ISSUES = 10

if (findings.length > MAX_INDIVIDUAL_ISSUES) {
  // Deduped on the contract address, which is stable across runs. The issue
  // stays open until someone works it; new keys on the same contract fold into
  // it rather than opening more.
  const target = findings[0].rateLimits
  if (alreadyReported(target)) {
    console.log(`Summary issue for ${target} already exists.`)
    process.exit(0)
  }

  const rows = findings
    .map(f => `| \`${f.key}\` | \`${f.maxAmount}\` | ${f.block} |`)
    .join('\n')

  execFileSync(
    'gh',
    [
      'issue',
      'create',
      '--title',
      `${findings.length} unresolved rate-limit keys on ${target}`,
      '--body',
      [
        `${findings.length} keys set on \`${target}\` cannot be resolved by this build.`,
        `Reported as one issue rather than ${findings.length} separate ones.`,
        '',
        `| Key | maxAmount | Block |`,
        `| --- | --- | --- |`,
        rows,
        '',
        `See \`packages/core/src/decoders/PAS.md\` for how to add a key name or an operand`,
        `address.`,
      ].join('\n'),
    ],
    { stdio: 'inherit' }
  )
  process.exit(0)
}

for (const finding of findings) {
  if (alreadyReported(finding.key)) {
    console.log(`  ${finding.key} already reported`)
    continue
  }
  openIssue(finding)
}
