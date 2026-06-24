# Sky Safe Transaction Decoder

> **"Don't trust, verify!"** - Independently verify Safe transaction hashes before signing.

TypeScript tool for calculating and verifying Safe multisig transaction hashes with security analysis and protocol-specific decoding. Available as a CLI, web UI, and core library.

Based on [pcaversaccio/safe-tx-hashes-util](https://github.com/pcaversaccio/safe-tx-hashes-util).

## What It Does

1. Fetches transaction data from the [Safe Transaction Service API](https://docs.safe.global/core-api/transaction-service-overview)
2. Calculates EIP-712 hashes (Domain, Message, Safe TX) independently
3. Verifies the calculated hash matches the API-provided hash
4. Re-encodes decoded parameters and compares with raw calldata
5. Runs security analysis (delegate calls, gas token attacks, owner modifications)
6. Displays results with protocol-specific decoding when available

**Safe versions**: v0.1.0 through v1.5.0

## Quick Start

### CLI

> **Always pin the version.** Unpinned `npx` runs whatever the registry serves
> at request time, which means a malicious publish could be executed before
> anyone notices. The examples below pin to a known-good version — bump it
> intentionally when you upgrade. See [SECURITY.md](./SECURITY.md) for the
> recommended verification flow (build from source) for high-assurance use.

```bash
npx @shield3/sky-safe-cli@0.2.0 verify \
  --address 0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d \
  --nonce 520
```

Or install globally with a pinned version:

```bash
npm install -g @shield3/sky-safe-cli@0.2.0
sky-safe verify --address 0x... --nonce 520
```

### Web UI

- Cloudflare Pages: [sky-safe-tx-decoder.pages.dev](https://sky-safe-tx-decoder.pages.dev/)
- IPFS: [sky-safe-tx-decoder](https://bafybeiavucfkhjjunfozcaetvhvaeibicb3iaoizbwqzkjzssvg4d7tat4.ipfs.dweb.link/)

Or run locally:

```bash
pnpm install
pnpm --filter @shield3/sky-safe-ui dev
```

#### Offline single-file build

For the highest-assurance setup — no hosting provider, no server, no `npm` to
run — build a single self-contained HTML file you open directly in a browser:

```bash
pnpm install
pnpm --filter @shield3/sky-safe-ui build:offline
# → packages/ui/dist-offline/index.html  (double-click to open)
```

Everything (JS + CSS) is inlined into that one file, so it runs from `file://`
with no external requests for app code. Audit it once, optionally pin its hash,
and run it from disk — the verification code is yours, not re-served by a CDN on
every visit. It still fetches transaction data from the Safe Transaction Service
API, so an internet connection is required; only the app code is local.

#### Address Config CSVs

The web UI loads two **independent**, session-only CSV files by drag-and-drop.
They share one schema but play different roles, so updating one never disturbs
the other:

| File | Role | In the app |
| ---- | ---- | ---------- |
| **Address book** | Managed externally (team-owned). Labels known addresses during review. | Read-only. Replace by loading a fresh file. |
| **My Safes** | Your personal Safe shortcuts (the home-page dropdown). | Editable (add/remove) and exportable. |

Each file self-identifies with a marker comment on the first line, so the UI can
reject a file dropped on the wrong slot:

```csv
# sky-safe-config: address-book
type,network,address,label,verification_date,status
address,,0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3,Sky LockstakeEngine,2026-05-01,active
```

```csv
# sky-safe-config: my-safes
type,network,address,label,verification_date,status
safe,ethereum,0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d,Treasury Safe,2026-05-10,active
```

See [`examples/address-book-template.csv`](examples/address-book-template.csv)
and [`examples/my-safes-template.csv`](examples/my-safes-template.csv). Older
address books with only `address,label,verification_date,status` still load.

Config is kept in memory for the current browser session and is **not** persisted
to local storage — the CSV files you keep externally are the source of truth.
This is intentional for a signing tool: a cached copy could be silently tampered
with or drift stale, so each session you re-load fresh files.

##### Managing My Safes

- **Settings page** (top-right link): review both files, remove individual
  Safes, and export My Safes back to CSV.
- **Export** (config bar or Settings): writes My Safes as a CSV that re-imports
  exactly (round-trip), with the kind marker.
- **Capture an unsaved Safe**: when you open a Safe that isn't in My Safes, a
  banner offers to label it, add it to the session, and re-export My Safes so
  you can save it back to your file. Because the address book and My Safes are
  separate files, you can update the managed address book anytime without losing
  your Safes.

### From Source

```bash
git clone https://github.com/0xShield3/sky-safe-tx-decoder
cd sky-safe-tx-decoder
pnpm install
pnpm build

# Run CLI
pnpm dev:cli verify --address 0x... --nonce 520

# Run UI dev server
pnpm --filter @shield3/sky-safe-ui dev
```

## Supported Networks

| Network          | Chain ID |
| ---------------- | -------- |
| Ethereum Mainnet | 1        |
| Base             | 8453     |
| Sepolia Testnet  | 11155111 |

## Project Structure

```
packages/
  core/   # @shield3/sky-safe-core - Hash calculation, decoding, security analysis
  cli/    # @shield3/sky-safe-cli - Command-line interface
  ui/     # @shield3/sky-safe-ui  - Web interface (React + Vite)
```

## Security Analysis

The tool detects:

- **Untrusted delegate calls** - Flags delegate calls to contracts not on the trusted list
- **Gas token attacks** - Custom gas token + custom refund receiver combinations
- **Owner/threshold modifications** - Direct and nested (via MultiSend) changes to Safe owners

### Example Warnings

The `examples/` directory contains crafted transactions that trigger each warning type:

```bash
sky-safe verify --file examples/gas-token-attack.json
sky-safe verify --file examples/untrusted-delegatecall.json
sky-safe verify --file examples/owner-modification.json
sky-safe verify --file examples/guard-set.json
sky-safe verify --file examples/module-enable.json
sky-safe verify --file examples/multiple-issues.json
```

## Custom Decoders

The decoder registry provides protocol-specific human-readable transaction explanations. Currently included:

| Protocol                     | Contract                                     | Functions                                           |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------- |
| Sky Protocol LockstakeEngine | `0xCe01C90dE7FD1bcFa39e237FE6D8D9F569e8A6a3` | 13 (urn management, staking, borrowing, delegation) |
| MultiSend                    | Standard Safe MultiSend                      | Batch transaction decoding                          |

See the [core package README](packages/core/README.md#creating-a-custom-decoder) for how to add your own.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`pnpm test`)
5. Submit a pull request

## Publishing to npm

Use `pnpm pack` then `npm publish` on the tarball. This ensures `workspace:*` dependencies are resolved to real versions. Do not use `npm publish` directly from a package directory.

```bash
# Core (publish first)
cd packages/core && pnpm pack && npm publish shield3-sky-safe-core-*.tgz --access public && rm *.tgz

# CLI
cd ../cli && pnpm pack && npm publish shield3-sky-safe-cli-*.tgz --access public && rm *.tgz
```

## Trust Assumptions

Users must trust:

- This TypeScript implementation
- [viem](https://viem.sh) cryptographic library
- Safe Transaction Service API data — however, the tool independently re-encodes decoded parameters and verifies they match the raw calldata and EIP-712 hashes, so API-provided decoded data is not blindly trusted
- Hardware wallet secure screen

## License

AGPL-3.0-only (matching [upstream](https://github.com/pcaversaccio/safe-tx-hashes-util))

## References

- [Safe Smart Account](https://github.com/safe-global/safe-smart-account)
- [Safe Transaction Service](https://docs.safe.global/core-api/transaction-service-overview)
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712)
- [Original Bash Tool](https://github.com/pcaversaccio/safe-tx-hashes-util)
