# Sky PAS decoder reference

Reference for the Sky PAS (Parallelized Allocation System) decoders in this directory:
`pas-configurator.ts` and the shared `pas-common.ts`.

## Contract

| Field | Value |
| --- | --- |
| Contract | PAS Configurator |
| Address | `0xb7E61Df6CAb0A51E9A5dab1A7DD3f942dDe5b929` |
| Network | Ethereum mainnet |
| Source | `src/Configurator.sol:Configurator` |
| Compiler | solc `0.8.24+commit.e11b9ed9` |
| Verification | Sourcify, exact match on creation and runtime bytecode |
| Proxy | No |
| Repository | https://github.com/sky-ecosystem/pas |

`Configurator.beamState()` returns `0x1A1879E66547F90bfF87D45A5b0335950E019E02`, read on
chain.

## Supported functions

The deployed contract exposes two state-changing functions. Both are decoded.

| Selector | Signature |
| --- | --- |
| `0x91cc936a` | `setRateLimit(address rateLimits, bytes32 key, uint256 maxAmount, uint256 slope)` |
| `0x7051c19c` | `callControllerAction(address controller, bytes data)` |

`zzz(address,bytes32)` and `beamState()` are views. They cannot appear in a Safe transaction
and are omitted from the ABI.

## Rate-limit key resolution

PAS rate-limit keys are keccak hashes, not right-padded ASCII. `bytes32ToLabel` in
`sky-common.ts` returns `(not ASCII)` for all of them.

`resolveRateLimitKey` in `pas-common.ts` identifies a key by recomputing its preimage and
comparing the result to the key byte for byte. A name is reported only on an exact hash
match.

Key names come from `sparkdotfi/spark-alm-controller` — `src/MainnetController.sol`,
`src/ForeignController.sol`, and the libraries under `src/libraries/`. Composition follows
`src/RateLimitHelpers.sol`:

| Shape | Construction | Example |
| --- | --- | --- |
| bare | `keccak256(name)` | `LIMIT_USDS_MINT` |
| address | `keccak256(abi.encode(base, a))` | `LIMIT_4626_DEPOSIT` × vault |
| address + address | `keccak256(abi.encode(base, a, b))` | `LIMIT_ASSET_TRANSFER` |
| bytes32 | `keccak256(abi.encode(base, a))` | `LIMIT_UNISWAP_V4_SWAP` × pool id |
| uint32 | `keccak256(abi.encode(base, a))` | `LIMIT_USDC_TO_DOMAIN` × domain |
| address + uint32 | `keccak256(abi.encode(base, a, b))` | `LIMIT_LAYERZERO_TRANSFER` |

Candidate operands for composite keys come from `CONTRACTS_BY_NETWORK` in
`packages/core/src/contracts/`. The candidate list bounds which keys can be resolved. It
cannot cause an incorrect name to be shown.

An unresolved key renders the full `bytes32`, carries a warning stating it could not be
resolved, and sets `riskLevel: 'high'`.

### Adding a resolvable composite key

Add the operand address to the network's file in `packages/core/src/contracts/` with a
label. No decoder change is needed.

Do not add a name to `RATE_LIMIT_KEYS` without the exact preimage string from
`spark-alm-controller` source. The hash is computed from the name at runtime, so an
approximate name yields a hash that matches nothing.

## Amount denomination

`maxAmount` and `slope` are denominated by the rate-limit key, not by the call target. A
denomination is recorded only where the controller source fixes it.

| Key | Denomination | Source |
| --- | --- | --- |
| `LIMIT_USDS_MINT` | USDS, 18 | `mintUSDS(uint256 usdsAmount)` |
| `LIMIT_USDS_TO_USDC` | USDC, 6 | source note: 1e6 precision, both swap directions |
| `LIMIT_USDE_MINT` | USDC, 6 | `prepareUSDeMint(uint256 usdcAmount)` |
| `LIMIT_USDE_BURN` | USDe, 18 | `prepareUSDeBurn(uint256 usdeAmount)` |
| `LIMIT_SUSDE_COOLDOWN` | USDe, 18 | rate-limited on assets, not sUSDe shares |
| `LIMIT_SUPERSTATE_SUBSCRIBE` | USDC, 6 | `subscribeSuperstate(uint256 usdcAmount)` |
| `LIMIT_USDC_TO_CCTP` | USDC, 6 | `transferUSDCToCCTP(uint256 usdcAmount, uint32)` |
| `LIMIT_USDC_TO_DOMAIN` | USDC, 6 | `transferUSDCToCCTP(uint256 usdcAmount, uint32)` |
| `LIMIT_WSTETH_DEPOSIT` | wstETH, 18 | deposit amount |
| `LIMIT_WSTETH_REQUEST_WITHDRAW` | stETH, 18 | rate-limited on `getStETHByWstETH(...)` |
| `LIMIT_WEETH_DEPOSIT` | WETH, 18 | deposit path unwraps WETH before eETH |
| `LIMIT_WEETH_REQUEST_WITHDRAW` | eETH, 18 | rate-limited on `eETHAmount` |
| `LIMIT_OTC_SWAP` | 18, all assets | `sent18 = amount * 1e18 / 10 ** decimals(asset)` |

Keys scoped to an operand token carry no denomination. Their amount may be denominated in
either an ERC-4626 vault's shares or its underlying asset depending on the entry point, and
that is a property of a second contract this table does not record. For these the decoder
shows the raw integer and states that the scale is undetermined. This matches the rule
documented in `packages/core/src/utils/token-decimals.ts`.

## Rendering rules

- `slope` is stored as units per second. The decoder also renders units per day.
- `type(uint256).max` renders as `UNLIMITED` with the full integer retained.
- On an unlimited key, `slope = 0` is the value the contract requires. It is not reported as
  a limit that never refills.
- Where the denomination is unknown, `maxAmount` is emitted as a bare integer so the
  decimals picker in the UI stays available.
- Addresses, `bytes32` keys, and calldata render in full. A resolved label is shown beside
  the full value, never in place of it.

## What the decoder does not do

**It does not state whether a call raises or lowers a limit.** Direction and ceiling depend
on the limit's current on-chain value, which is not in the calldata. The decoder reports the
values and names the reads that settle it.

The relevant ceiling condition in the deployed source is a three-way disjunction:

```solidity
maxAmount <= defMaxAmount ||
maxAmount <= current.maxAmount ||
maxAmount <= current.maxAmount * maxChange / WAD
```

**It does not decode the inner calldata of `callControllerAction`.** No ABI for an arbitrary
controller is available at this layer. The decoder surfaces `keccak256(data)` as its own
parameter, because BeamState authorises the call through
`isControllerActionEnabled(keccak256(data), controller)`. The full inner calldata and its
selector are shown.

**It does not read chain state.** Denominations come from the table above, never from a
`decimals()` call.

## Security properties

- Every decode is re-encoded and byte-compared against the raw calldata before display.
- The decoder is pinned to one address on one network. It does not match on selectors.
- Key resolution reports a name only on an exact hash match.
- An undecodable call throws, so the registry falls back to the undecodable state.

## Scope

`pas-configurator.ts` covers the Configurator only. BeamState, PASMom, and Timelock have no
decoder.

Composite keys resolve only when the operand address is in the contract registry. `bytes32`
pool-id keys and `address+uint32` LayerZero keys are not resolved, because their operand
spaces are too large to search.

## Test fixtures

Fixtures in `pas-configurator.test.ts` use values read from the Grove RateLimits contract
`0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1` on 2026-08-17. Two keys were set at that time:

| Key | maxAmount | slope |
| --- | --- | --- |
| `LIMIT_USDS_MINT` | `5000000000000000000000000` (5,000,000 USDS) | `57870370370370370370` |
| `LIMIT_USDS_TO_USDC` | `5000000000000` (5,000,000 USDC) | `57870370` |

The pair covers an 18-decimal and a 6-decimal denomination at the same nominal size.

Base key hashes are pinned as literals in `pas-common.test.ts`. The resolver computes them
from the name string, so a rename would otherwise stop a key resolving with no test failure.
