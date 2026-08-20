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

Key names come from **`sky-ecosystem/diamond-pau`** — the facets under `src/facets/` and the
helper library `src/libraries/RateLimitHelpers.sol`. 66 names are recorded.

> **Not `sparkdotfi/spark-alm-controller`.** The two share a naming convention and differ in
> ways that silently break resolution. diamond-pau splits operations spark combines
> (`LIMIT_USDS_BURN`, `LIMIT_USDC_TO_USDS`), and uses different **shapes** for the same name:
> `LIMIT_4626_DEPOSIT` is keyed by two addresses here and one in spark, `LIMIT_AAVE_DEPOSIT`
> by three. A wrong shape hashes to nothing, so the failure mode is an unresolved key rather
> than a wrong name — safe, but still a failure.

| Shape | Construction | Searchable |
| --- | --- | --- |
| bare | `keccak256(name)` | yes |
| address | `keccak256(abi.encode(base, a))` | yes |
| address + address | `keccak256(abi.encode(base, a, b))` | yes |
| uint32 | `keccak256(abi.encode(base, a))` | yes, bounded range |
| address + address + address | `keccak256(abi.encode(base, a, b, c))` | no |
| address + bytes32 | `keccak256(abi.encode(base, a, b))` | no |
| address + uint16 + address | `keccak256(abi.encode(base, a, b, c))` | no |
| address + address + bytes32 + uint32 | `keccak256(abi.encode(base, a, b, c, d))` | no |

Unsearchable shapes are declared so an unresolved key can be described accurately, but their
operand spaces cannot be enumerated. `unsearchableShapeReason` supplies the reason.

Candidate operands for searchable composite keys come from `CONTRACTS_BY_NETWORK` in
`packages/core/src/contracts/`. The candidate list bounds which keys can be resolved. It
cannot cause an incorrect name to be shown.

An unresolved key renders the full `bytes32`, carries a warning stating it could not be
resolved, and sets `riskLevel: 'high'`.

### Adding a resolvable composite key

Add the operand address to the network's file in `packages/core/src/contracts/` with a
label. No decoder change is needed.

Do not add a name to `RATE_LIMIT_KEYS` without the exact preimage string from **diamond-pau**
facet source. The hash is computed from the name at runtime, so an approximate name yields a
hash that matches nothing.

## Amount denomination

`maxAmount` and `slope` are denominated by the rate-limit key, not by the call target. A
denomination is recorded only where the facet source has been read.

| Key | Denomination | Source |
| --- | --- | --- |
| `LIMIT_USDS_MINT` | USDS, 18 | `mint(uint256 usdsAmount)` |
| `LIMIT_USDS_BURN` | USDS, 18 | `burn(uint256 usdsAmount)` |
| `LIMIT_USDS_TO_USDC` | USDC, 6 | `swapUSDSToUSDC(uint256 usdcAmount)` |
| `LIMIT_USDC_TO_USDS` | USDC, 6 | `swapUSDCToUSDS(uint256 usdcAmount)` |
| `LIMIT_BASIN_DEPOSIT` | operand 0 | `deposit` rate-limits `amount` of `asset` |
| `LIMIT_BASIN_WITHDRAW` | operand 0 | `withdraw` rate-limits `assetsWithdrawn` of `asset` |

The two Basin keys use `denominationOperand: 0`. The facet counts units of `asset`, and
`asset` is the first operand, so a resolved operand 0 that is a known token in this
repository's registry supplies the decimals. That is source-backed, not inferred from the key
name — and it is why the same key name renders as USDS on one Basin and USDC on another.

Every other key deliberately carries no denomination. Its scale follows a token this table
does not record.

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

Fixtures use values read from the Grove RateLimits contract
`0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1` on 2026-08-20. Ten keys are set:

| Key | Operands | maxAmount |
| --- | --- | --- |
| `LIMIT_USDS_MINT` | bare | 5,000,000 USDS |
| `LIMIT_USDS_BURN` | bare | 5,000,000 USDS |
| `LIMIT_USDS_TO_USDC` | bare | 5,000,000 USDC |
| `LIMIT_USDC_TO_USDS` | bare | 5,000,000 USDC |
| `LIMIT_BASIN_DEPOSIT` | USDS, JTRSY Basin | 5,000,000 USDS |
| `LIMIT_BASIN_DEPOSIT` | USDS, BUIDL Basin | 5,000,000 USDS |
| `LIMIT_BASIN_WITHDRAW` | USDS, JTRSY Basin | UNLIMITED |
| `LIMIT_BASIN_WITHDRAW` | USDC, JTRSY Basin | UNLIMITED |
| `LIMIT_BASIN_WITHDRAW` | USDS, BUIDL Basin | UNLIMITED |
| `LIMIT_BASIN_WITHDRAW` | USDC, BUIDL Basin | UNLIMITED |

All ten `bytes32` values are pinned in `pas-common.test.ts`, which asserts the resolver
returns a name and the correct denomination for every one.

Base key hashes are also pinned as literals. The resolver computes them from the name string,
so a rename would otherwise stop a key resolving with no test failure.
