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
Safe TX Hash:   0x5678...

Safe Transaction Hash (API): 0x5678...

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
