# @shield3/sky-safe-cli

Command-line tool for verifying Safe multisig transaction hashes.

## Installation

```bash
npm install -g @shield3/sky-safe-cli
```

Or run directly:

```bash
npx @shield3/sky-safe-cli verify --address 0x... --nonce 520
```

## Usage

```bash
# Ethereum mainnet (default)
sky-safe verify \
  --address 0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d \
  --nonce 520

# Sepolia testnet
sky-safe verify \
  --address 0x384937B93ca0dB13f5bC62450f309b31CC48D278 \
  --nonce 8 \
  --network sepolia

# From local JSON file
sky-safe verify --file examples/gas-token-attack.json
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--address <address>` | Safe contract address | - |
| `--nonce <nonce>` | Transaction nonce | - |
| `--network <network>` | Network (`ethereum`, `sepolia`) | `ethereum` |
| `--file <path>` | Load from JSON file instead of API | - |
| `--nested-safe-address <address>` | Owner Safe that approves with `approveHash` | - |
| `--nested-safe-nonce <nonce>` | Nonce of that Safe's `approveHash` transaction | - |
| `--nested-safe-version <version>` | Safe contract version of that Safe | - |

### Nested Safes

An owner that is itself a Safe cannot sign. It approves by executing its own Safe
transaction calling `approveHash(bytes32)` on the parent, so its signers verify
different hashes.

Pass all three `--nested-safe-*` flags to print those hashes after the parent's.
The CLI makes no extra network call for them; look the nonce and version up in
the Safe UI or with `cast`.

```bash
sky-safe verify \
  --address 0x1a37bF1Ccbf570C92FE2239FefaaAF861c2924DD \
  --nonce 13 \
  --nested-safe-address 0xC3eA7C657884BB380B66D79C36aDCb5658b01896 \
  --nested-safe-nonce 13 \
  --nested-safe-version 1.4.1
```

The approved hash is the `safeTxHash` the tool computed. If it does not match the
one the Safe API reported, the nested hashes are withheld.

## Output

The tool displays:

1. **Transaction data** - All parameters with known address labels
2. **Decoded data** - Method and parameters with verification status
3. **Custom decoder analysis** - Protocol-specific explanations (when available)
4. **Security analysis** - Delegate call, gas token, and owner modification warnings
5. **Hash verification** - Independently calculated EIP-712 hashes compared against the API

```
Computed Hashes

Domain Hash:    0xabcd...
Message Hash:   0x1234...
safeTxHash:     0x5678...

safeTxHash (API): 0x5678...

HASH VERIFIED: Calculated hash matches API hash
  This is the hash you should see on your hardware wallet.
```

## Development

```bash
# From the monorepo root
pnpm --filter @shield3/sky-safe-cli dev verify --address 0x... --nonce 42

# Build
pnpm --filter @shield3/sky-safe-cli build
```

## License

AGPL-3.0-only
