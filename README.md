# Safe Transaction Decoder

> **"Don't trust, verify!"** - Independently verify Safe transaction hashes before signing.

TypeScript tool for calculating and verifying Safe multisig transaction hashes with security analysis and protocol-specific decoding. Available as a CLI, web UI, and core library.

This is a **generic, protocol-agnostic** decoder. It ships with a single example
protocol decoder for **WETH** (`packages/core/src/decoders/weth.ts`) to demonstrate
how to add human-readable explanations for any contract — copy that file to support
your own protocol.

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

```bash
npx @shield3/safe-tx-cli verify \
  --address 0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d \
  --nonce 520
```

Or install globally:

```bash
npm install -g @shield3/safe-tx-cli
safe-tx verify --address 0x... --nonce 520
```

### Web UI

Deploy your own (see [Deployment](#deployment)), or run locally:

```bash
pnpm install
pnpm --filter @shield3/safe-tx-ui dev
```

### From Source

```bash
git clone https://github.com/0xShield3/sky-safe-tx-decoder
cd sky-safe-tx-decoder
pnpm install
pnpm build

# Run CLI
pnpm dev:cli verify --address 0x... --nonce 520

# Run UI dev server
pnpm --filter @shield3/safe-tx-ui dev
```

## Supported Networks

| Network | Chain ID |
|---------|----------|
| Ethereum Mainnet | 1 |
| Base | 8453 |
| Sepolia Testnet | 11155111 |

## Project Structure

```
packages/
  core/   # @shield3/safe-tx-core - Hash calculation, decoding, security analysis
  cli/    # @shield3/safe-tx-cli - Command-line interface
  ui/     # @shield3/safe-tx-ui  - Web interface (React + Vite)
```

## Security Analysis

The tool detects:
- **Untrusted delegate calls** - Flags delegate calls to contracts not on the trusted list
- **Gas token attacks** - Custom gas token + custom refund receiver combinations
- **Owner/threshold modifications** - Direct and nested (via MultiSend) changes to Safe owners

### Example Warnings

The `examples/` directory contains crafted transactions that trigger each warning type:

```bash
safe-tx verify --file examples/gas-token-attack.json
safe-tx verify --file examples/untrusted-delegatecall.json
safe-tx verify --file examples/owner-modification.json
safe-tx verify --file examples/guard-set.json
safe-tx verify --file examples/module-enable.json
safe-tx verify --file examples/multiple-issues.json
```

## Custom Decoders

The decoder registry provides protocol-specific human-readable transaction explanations. Currently included:

| Protocol | Contract | Functions |
|----------|----------|-----------|
| WETH (example) | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | 5 (deposit, withdraw, transfer, approve, transferFrom) |
| MultiSend | Standard Safe MultiSend | Batch transaction decoding |

The WETH decoder is a fully-commented **template** — see
`packages/core/src/decoders/weth.ts` and the
[core package README](packages/core/README.md#creating-a-custom-decoder) for how to
add a decoder for your own protocol.

## Deployment

The web UI is a static SPA — build it and host the `dist/` folder anywhere.

### Cloudflare Pages

A `wrangler.toml` is included in `packages/ui`. From that directory:

```bash
pnpm --filter @shield3/safe-tx-ui build
cd packages/ui
npx wrangler login              # one-time, opens a browser
npx wrangler pages deploy dist  # deploys to the project named in wrangler.toml
```

Edit `name` in `packages/ui/wrangler.toml` to set your Cloudflare Pages project
name (create the project on first deploy when prompted). `_redirects` and
`_headers` in `packages/ui/public` handle SPA routing and content types.

### Other static hosts

`pnpm --filter @shield3/safe-tx-ui build` then upload `dist/` to Vercel, Netlify,
IPFS, or any static host. No server or environment variables are required.

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
cd packages/core && pnpm pack && npm publish shield3-safe-tx-core-*.tgz --access public && rm *.tgz

# CLI
cd ../cli && pnpm pack && npm publish shield3-safe-tx-cli-*.tgz --access public && rm *.tgz
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
