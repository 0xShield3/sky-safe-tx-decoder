# @shield3/sky-safe-core

Core library for Safe transaction hash calculation, decoding, and verification.

## Installation

```bash
npm install @shield3/sky-safe-core
```

## Usage

### Calculate Transaction Hash

```typescript
import { calculateSafeTxHash } from '@shield3/sky-safe-core'

const result = calculateSafeTxHash(
  1, // chainId
  '0xf65475e74C1Ed6d004d5240b06E3088724dFDA5d', // Safe address
  {
    to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    value: '0',
    data: '0xa9059cbb...',
    operation: 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000',
    refundReceiver: '0x0000000000000000000000000000000000000000',
    nonce: '520',
  },
  '1.3.0' // Safe version
)

console.log(result.safeTxHash)  // Hash to verify on hardware wallet
console.log(result.domainHash)  // EIP-712 domain separator
console.log(result.messageHash) // Transaction message hash
```

### Verify Decoded Data

```typescript
import { verifyDecodedData } from '@shield3/sky-safe-core'

const verification = verifyDecodedData(rawData, decodedData)
if (verification.verified) {
  console.log('Decoded data matches raw calldata')
}
```

### Security Analysis

```typescript
import { analyzeSecurity } from '@shield3/sky-safe-core'

const analysis = analyzeSecurity(txData)
console.log(analysis.overallRisk) // 'none' | 'low' | 'medium' | 'high' | 'critical'
```

### Safe API Client

```typescript
import { createSafeApiClient } from '@shield3/sky-safe-core'

const client = createSafeApiClient('ethereum')
const txs = await client.fetchTransactionsByNonce('0x...', 520)
const version = await client.fetchSafeVersion('0x...')
```

## Creating a Custom Decoder

Custom decoders provide human-readable explanations for protocol-specific transactions.

### 1. Create the decoder

```typescript
// packages/core/src/decoders/your-protocol.ts
import type { CustomDecoder, DecodedTransactionData } from './types.js'
import { decodeFunctionData, type Address, type Hex } from 'viem'

export class YourProtocolDecoder implements CustomDecoder {
  private static readonly ADDRESSES: Record<string, Address> = {
    ethereum: '0x...',
  }

  canDecode(to: Address, network: string): boolean {
    const target = YourProtocolDecoder.ADDRESSES[network]
    return target !== undefined && to.toLowerCase() === target.toLowerCase()
  }

  decode(to: Address, data: Hex, network: string): DecodedTransactionData | null {
    // Decode calldata and return structured result
    // Return null if decoding fails
  }
}
```

### 2. Register it

```typescript
import { decoderRegistry, YourProtocolDecoder } from '@shield3/sky-safe-core'
decoderRegistry.register(new YourProtocolDecoder())
```

### 3. Export from core

```typescript
// packages/core/src/index.ts
export * from './decoders/your-protocol.js'
```

See `packages/core/src/decoders/lockstake-engine.ts` for a complete example with 13 functions, multicall support, and risk assessment.

## API Reference

### Hash Calculation
- `calculateSafeTxHash()` - Calculate EIP-712 Safe transaction hash
- `verifySafeTxHash()` - Compare calculated hash with API hash

### Decoding
- `decoderRegistry` - Global decoder registry
- `verifyDecodedData()` - Verify decoded data integrity
- `isMultiSend()` / `decodeMultiSend()` - MultiSend support

### Security
- `analyzeSecurity()` - Delegate call, gas token, and owner modification detection
- `getAddressTag()` - Known contract labels

### API Client
- `createSafeApiClient()` - Safe Transaction Service client
- `isNetworkSupported()` - Check network availability

## License

AGPL-3.0-only
