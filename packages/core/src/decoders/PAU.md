# Sky PAU decoder reference

Reference for the Sky PAU (Parallelized Allocation Unit) decoder in this directory:
`pau-agent.ts`, the shared `pau-common.ts`, the generated `pau-dispatch-table.ts`, and the
live check in `pau-verify.ts`.

PAU is the successor to `spark-alm-controller`. It replaces the ALMProxy / Controller /
RateLimits trio with a diamond-style system. Source: https://github.com/sky-ecosystem/diamond-pau

PAS is the governance layer that sets the budgets. PAU is the execution layer that spends
them. Grove's `PAU_RATE_LIMITS` `0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1` is the same
contract the PAS Configurator's `setRateLimit` calls target.

## Contracts

The decoder is registered for the AdministeredAgent, which is the contract an allocator Safe
calls. Every other address below is reached through it.

| Field | Value |
| --- | --- |
| Decoded contract | PAU AdministeredAgent |
| Address (Grove) | `0xdBD17832df0e57b1732cE1C84c652E820e549BAa` |
| Address (second instance) | `0x1837505D104F7a6D8b7e19452610B0A3D652EF12` |
| Network | Ethereum mainnet |
| Source | `lib/pau-administered-agent/src/AdministeredAgent.sol:AdministeredAgent` |
| Verification | Sourcify, exact match |
| Proxy | No |

Both AdministeredAgents have runtime bytecode with keccak256
`0xb56e803a74ca3a82b1bff9be86f8aeb1b22a90470c607ee76d510d9cc76a15a9`. They are the same
implementation.

### Grove's deployment

Read from `grove-labs/grove-address-registry` at commit
`f2b0ac5bc8346e2ce615900b43bb5144b503c461`, then verified independently. `eth_getCode`
returned bytecode for every address, and each matched on Sourcify.

| Registry name | Address | Sourcify contract |
| --- | --- | --- |
| `PAU_PROXY` | `0x0DcD9298e163dFD3c0B5b00F0d9093C36e40A153` | `src/ALMProxy.sol:ALMProxy` |
| `PAU_CONTROLLER` | `0xbf83F5974B932c7D842254042717D6A2706CE5eE` | `lib/diamond-pau/src/Controller.sol:Controller` |
| `PAU_ACCESS_CONTROLS` | `0x4F6d1704700cd494DD4cd9bF59c0C39DA1Bc9164` | `lib/diamond-pau/src/AccessControls.sol:AccessControls` |
| `PAU_RATE_LIMITS` | `0xE016Ae733A77Ba77E7907aAA749394Fc5e75C0e1` | `src/RateLimits.sol:RateLimits` |
| `PAU_ADMINISTERED_AGENT` | `0xdBD17832df0e57b1732cE1C84c652E820e549BAa` | `lib/pau-administered-agent/src/AdministeredAgent.sol:AdministeredAgent` |
| `PAU_BEACON` | `0x829dC2b7E94B1954F0764E573f2E0d45Afa28199` | `lib/diamond-pau/src/Beacon.sol:Beacon` |
| `PAU_FACTORY` | `0x69A5d548830AC2A4Ba90A44a2C75BDA71f97fc66` | `lib/diamond-pau/src/PAUFactory.sol:PAUFactory` |
| `PAU_BASIN_FACET` | `0xC84825BCD13AEddc372400239499380376a44A39` | `lib/diamond-pau/src/facets/basin/BasinFacet.sol:BasinFacet` |
| `PAU_PSM_FACET` | `0xE4A5dAc768a310cc2316f258901b32E499653064` | `lib/diamond-pau/src/facets/psm/PSMFacet.sol:PSMFacet` |
| `PAU_UNISWAP_V3_FACET` | `0x445D9Dc752F269Be48250f1A180CAC4c61cE4bab` | `lib/diamond-pau/src/facets/uniswap-v3/UniswapV3Facet.sol:UniswapV3Facet` |
| `PAU_USDS_FACET` | `0x1221CC4B85Ab260660aD21C2829e0EB516dffBc7` | `lib/diamond-pau/src/facets/usds/USDSFacet.sol:USDSFacet` |

### The second Controller

| Field | Value |
| --- | --- |
| Controller | `0x24169Afb34fAe4D4356BC54Bd80319131e35ca38` |
| AdministeredAgent | `0x1837505D104F7a6D8b7e19452610B0A3D652EF12` |
| AccessControls | `0x791D2a017532CfAD881c446e6bF93BbC3c0778b2` |
| ALMProxy | `0x6d370e359e9cbd0Fd35Bb38fAF705D84238CB884` |
| RateLimits | `0xE9a78f34fe497e2186f81B8c014cd93B308BC62a` |
| AaveFacet | `0x8CE890A96a193ff2DD4B2eA3C682326F655f6b62` |
| USDSFacet | `0x1221CC4B85Ab260660aD21C2829e0EB516dffBc7` |

`0x1837505D104F7a6D8b7e19452610B0A3D652EF12` holds `ALLOCATOR_ROLE`
(`0x68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f46`) on that AccessControls,
read from its `RoleGranted` log at block 25383064. Its actor list contains Safe
`0x3dE688267Cf099307aBdd85F64D8efe03D0b2b26`, which originates the calls.

**Which sub-DAO owns this Controller was not determined.**

## The call path

```
Safe -> MultiSend -> AdministeredAgent.batchCall -> Controller -> facet (delegatecall)
```

The AdministeredAgent holds `ALLOCATOR_ROLE` and forwards each call with a plain `CALL`. The
Controller holds no integration logic. Its `fallback` reads `dispatches[msg.sig]` and
delegatecalls a facet with the incoming 4-byte selector **replaced** by a stored delegate
selector:

```solidity
fallback() external payable {
    Dispatch storage dispatch = _getControllerStorage().dispatches[msg.sig];
    address facet = dispatch.facet;
    require(facet != address(0), CallSelectorNotWired(msg.sig));
    facet.delegatecall(abi.encodePacked(dispatch.delegateSelector, msg.data[4:]));
}
```

Three consequences follow.

1. **The call selector appears in no ABI.** It is chosen when an integration is wired and
   stored as on-chain state. It is not derivable from the Controller's source, a facet's
   source, or a 4-byte database.
2. **The call selector and the facet function selector differ.** Facet function names collide
   across facets — three facets in the frozen tables declare `deposit` — so each wire needs a
   distinct call selector.
3. **The argument bytes pass through unchanged.** `msg.data[4:]` is forwarded verbatim, so the
   argument types of a call selector are exactly those of its delegate function. Decoding is
   exact once the dispatch is known, and the re-encode check applies normally.

The Sourcify fallback cannot decode any PAU allocator call. It fetches the ABI of the call
target, which is the Controller, and the Controller's verified ABI holds 11 functions, all
views or integration management. Grove's Controller has 47 call selectors wired. Zero of them
appear in that ABI. Proxy resolution does not help: this is not an EIP-1967 proxy, and the
`Beacon` here is a Sky config registry that shares the name.

## Supported functions

| Selector | Signature | Decoded |
| --- | --- | --- |
| `0x4e120423` | `batchCall(address[] targets, bytes[] data, uint256[] values)` | yes |
| — | `call(address target, bytes data)` | no |

`call` is not decoded. Every observed PAU allocator transaction uses `batchCall`, and the
AdministeredAgent is verified on Sourcify, so a `call` falls through to the Sourcify fallback
in the web UI.

## The frozen dispatch table

`pau-dispatch-table.ts` maps a Controller call selector to the facet address, the delegate
selector, the facet contract name, the facet function's ABI fragment, and the integration id.
It records the block and date it was read at.

**The file is generated. Hand-editing it is a defect.** A hand-typed selector that is wrong
does not fail to decode.

### Why a frozen copy

The alternative is to read `getDispatch` over RPC for every call. That is correct by
construction, but it makes the decoder asynchronous and network-bound, so the CLI and the
offline build lose PAU decoding entirely. Every other decoder in this repository is
synchronous and pure.

### What a frozen copy costs

A stale entry does not fail to decode. The Controller forwards the argument bytes verbatim, so
a rewired selector keeps the same argument shape, the decoding still round-trips, and the
re-encode check still passes. The signer is shown a confident wrong function name.

Compare the PAS key table, where a stale entry yields an unresolved `bytes32` and an explicit
warning. That degrades usefulness. This would degrade correctness.

Two mechanisms bound the risk. Neither is in the decoder.

- The web UI runs one `eth_call` to `getDispatches` and refuses to present a decoding whose
  entry disagrees with the chain. See **Verification behaviour** below.
- A scheduled workflow diffs the table against the chain daily and opens an issue on any
  difference. See **The monitor** below.

### Rewiring frequency

Measured on 2026-08-20 with archive `eth_getLogs` over the full history of the global Beacon
and every deployed Controller.

The wiring event is `IntegrationSet(bytes32 id, (address facet, (bytes4 callSelector, bytes4
delegateSelector)[] wires))`, topic
`0x5d055c4f05bd18deea319d5a3203b45d847aedd23073a618067b95ddd537c946`. The removal event is
`IntegrationRemoved(bytes32)`, topic
`0x043c2a2fce5883ae183cf4a77a5b7883a31824c8f21570b619972fbe500b79e6`.

| Registry | IntegrationSet | IntegrationRemoved | Distinct call selectors | Selectors wired twice | Selectors remapped |
| --- | --- | --- | --- | --- | --- |
| Beacon `0x829dC2b7E94B1954F0764E573f2E0d45Afa28199` | 25 | 0 | 223 | 0 | 0 |
| Grove Controller `0xbf83F5974B932c7D842254042717D6A2706CE5eE` | 4 | 0 | 47 | 0 | 0 |

Across 29 wiring events covering 270 selectors, no selector has been wired twice, no
integration has been removed, and no call selector has been remapped. Every wiring event to
date is purely additive.

Two qualifications.

- The observation window starts 2026-06-03, so it covers about eleven weeks.
- The mechanism for remapping exists. `Controller.sol` has exactly two dispatch-table
  mutators, `updateIntegrations(bytes32[])` and `removeIntegrations(bytes32[])`. There is no
  version counter. `updateIntegrations` on an existing id deletes the old wires and installs
  the current Beacon config, so a remap is possible. It has not been exercised.

## Verification behaviour

`pau-verify.ts` runs ONE `eth_call` to `Controller.getDispatches(bytes4[])` with exactly the
call selectors present in the transaction, and compares the answer to the frozen entries.

| Case | Condition | Behaviour |
| --- | --- | --- |
| verified | every frozen entry matches the chain | The decoding renders. A banner states the entries were verified against the chain this session, and names the frozen block. |
| unavailable | no RPC, no network, a malformed answer, or a wrong-length answer | The decoding renders. A banner states the table was frozen at block N on DATE and was not verified this session, and names the read that settles it. |
| mismatch | at least one frozen entry differs | The decoding is **withheld**. A high-risk block states that the on-chain mapping differs, shows the frozen and on-chain facet and delegate selector in full, and shows the raw calldata. |

A transport problem never produces a mismatch. A mismatch banner that fires on a network
hiccup is a banner a signer learns to ignore.

The check runs in the web UI only. **The CLI is permanently in the `unavailable` case**, and
the decoder's own explanation always states the frozen block and that it was not verified.

## Max slippage

`setMaxSlippage` is stored inverted relative to the usual convention. It is not how much
deviation is allowed. It is how close to expected the result must be, scaled to 1e18.

Both facets that expose it compute the same check. `UniswapV3Facet._validateMinAmount`
computes `minAmountThreshold = expected * maxSlippage / 1e18`. `AaveFacet.deposit` requires
`amountReceived >= amount * maxSlippage / 1e18`.

| Value | Reading |
| --- | --- |
| `999000000000000000` | the result must be at least 99.9% of expected, so 0.1% tolerance |
| `1000000000000000000` | no slippage allowed |
| `0` | the unconfigured state — both facets `require(maxSlippage != 0)` and revert with `max-slippage-not-set` |
| above `1000000000000000000` | demands more than the expected amount, so every operation that reads it reverts |

Both readings of the number fail dangerously, in opposite directions. A signer applying the
usual convention reads `999000000000000000` as "99.9% slippage allowed" and waves through a
value that is strict, and reads `0` as maximum safety.

| Facet | Keyed by | Read by |
| --- | --- | --- |
| `UniswapV3Facet` | pool | `addLiquidity`, `removeLiquidity` |
| `AaveFacet` | aToken market | `deposit` |

`UniswapV3Facet.swap` is **not** bounded by max slippage. The facet bounds it by
`maxTickDelta` against the TWAP and by the caller's own minimum output.

Live values read through Grove's wired `getMaxSlippage` call selector `0xa91abea2` on
2026-08-20: the Uniswap v3 AUSD/USDC pool `0xbAFeAd7c60Ea473758ED6c6021505E8BBd7e8E5d` returns
`999000000000000000`. Every other address returns `0`, because the mapping is keyed by pool
rather than by token and only that pool is configured.

## Amount denomination

Amounts are denominated by the facet function, not by the call target. A denomination is
recorded only where the facet source names the unit. It is keyed by facet contract name and
signature, because facet function names collide.

| Facet function | Denomination | Source |
| --- | --- | --- |
| `USDSFacet.mint(uint256)` | USDS, 18 | parameter is `usdsAmount` |
| `USDSFacet.burn(uint256)` | USDS, 18 | parameter is `usdsAmount` |
| `PSMFacet.swapUSDCToUSDS(uint256)` | USDC, 6 | parameter is `usdcAmount` |
| `PSMFacet.swapUSDSToUSDC(uint256)` | USDC, 6 | parameter is `usdcAmount` |
| `BasinFacet.deposit(address,address,uint256,uint256)` | parameter 1 | `amount` counts units of `asset` |
| `BasinFacet.withdraw(address,address,uint256,uint256)` | parameter 1 | `maxAmount` counts units of `asset` |

The two Basin entries denominate against **parameter 1**, which is `asset`. Parameter 0 is the
Basin. The signature is `deposit(address basin, address asset, uint256 amount, uint256
minSharesOut)`.

The USDS and USDC addresses were read from the Grove Controller's own wired views on
2026-08-20: `usds()` at call selector `0x3ca47c53` returns
`0xdC035D45d973E3EC169d2276DDab16f1e407384F`, and `usdc()` at call selector `0xca222cae`
returns `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`. Decimals come from
`CONTRACTS_BY_NETWORK`, never from a chain call.

Every other numeric parameter renders as a bare integer, which keeps the decimals picker in
the UI live. This matches the rule documented in
`packages/core/src/utils/token-decimals.ts`.

A second table records the parameters that **are** amounts but that this build cannot scale.
Those carry the caveat "the scale is undetermined". The caveat lands only there, so a
`deadline` or a `tokenId` is not told it has an undetermined denomination.

| Facet function | Parameter | Why no scale |
| --- | --- | --- |
| `UniswapV3Facet.swap` | `amountIn` | counts units of `tokenIn` |
| `UniswapV3Facet.swap` | `minAmountOut` | counts units of the token received, which the pool decides and the calldata does not name |
| `UniswapV3Facet.removeLiquidity` | `liquidity` | counts Uniswap v3 liquidity units, not tokens |
| `BasinFacet.deposit` | `minSharesOut` | counts Basin shares, whose decimals belong to the Basin contract |
| `BasinFacet.withdraw` | `minConversionRate` | is a rate, not an amount |
| `AaveFacet.deposit` | `amount` | counts units of an aToken, and no aToken is in the contract registry |
| `AaveFacet.withdraw` | `amount` | counts units of an aToken, and no aToken is in the contract registry |

`UniswapV3Facet.addLiquidity` and `removeLiquidity` carry their amounts inside `TokenAmounts`
tuples. Those render as tuples with every component in full and are not scaled: `amount0` and
`amount1` are denominated in the pool's own tokens, which are a property of the pool contract
and are not in the calldata.

## Rendering rules

- Both selectors are always shown: the call selector sent, and the delegate selector executed.
  They differ on every wire.
- The facet address, the facet contract name, and the integration id are shown for every call.
- Addresses, `bytes4` selectors, `bytes32` ids, and calldata render in full. A resolved label
  is shown beside the full value, never in place of it.
- Tick bounds render as raw `int24` values. TWAP windows render as raw `uint32` seconds. Tick
  deltas render as raw `uint24` values. None is a price or a percentage, and the explanation
  says so.
- Where the denomination is unknown, an amount is emitted as a bare integer so the decimals
  picker in the UI stays available.
- Every nested call's warnings are lifted onto the batch, because the UI renders a batch's
  warning list and not a nested call's.

## What the decoder does not do

**It does not read chain state.** The dispatch table is frozen and the denominations come from
the table above.

**It does not name a call selector.** A wire's call selector has no recoverable name. The
decoder shows the facet function name, which is accurate for behaviour but is not the name of
the selector sent. Both selectors are shown so this cannot be mistaken.

**It does not decode a Controller it holds no table for.** The call renders as undecodable,
states that the mapping is per-Controller on-chain state, lists the Controllers the build does
cover, shows the full calldata, and sets `riskLevel: 'high'`.

**It does not decode a call selector absent from the table.** Same treatment, plus the frozen
block, plus the `getDispatch` read that settles it.

**It does not decode `AdministeredAgent.call`.** See **Supported functions**.

## Security properties

- Every decode is re-encoded and byte-compared against the bytes the facet receives, which are
  the signed calldata with its first four bytes replaced by the delegate selector. Those four
  bytes are displayed separately and in full.
- The decoder is pinned to specific AdministeredAgent addresses. It does not match on
  selectors alone.
- A dispatch is resolved only on an exact call-selector match in the frozen table for the
  exact Controller address in the calldata.
- The live check refuses to present a decoding rather than annotating it.
- An undecodable call yields an explicit high-risk entry naming what is missing.

## Regenerating the table

```
ETH_RPC_URL=... node scripts/generate-pau-dispatch.mjs
```

The script calls `integrations()` on each Controller at the current block, fetches each
facet's verified ABI from Sourcify, resolves every delegate selector to a function name and
its inputs, and writes `packages/core/src/decoders/pau-dispatch-table.ts`. It uses plain
`eth_call` only — no `eth_getLogs`, because `integrations()` returns the current state
directly and public nodes refuse wide log ranges.

A wire whose delegate selector is absent from the facet's verified ABI is omitted and
reported. The decoder then treats that call selector as unknown, rather than claiming coverage
it does not have.

Add a Controller by adding an entry to `CONTROLLERS` in the script and regenerating.

Register a new AdministeredAgent by adding an entry to `PAU_ADMINISTERED_AGENTS` in
`pau-agent.ts`. The dispatch tables are shared across agents: a table is selected by the
Controller address in the calldata, not by which agent forwarded the call.

## The monitor

`.github/workflows/pau-dispatch.yml` runs daily and on manual dispatch. It regenerates the map
from the chain and diffs it against the committed table.

It **files an issue only**. It never commits and never auto-updates the table.

The issue body separates two cases.

| Case | Meaning | Issue wording |
| --- | --- | --- |
| additive | a call selector is wired on chain and absent from the table | regenerate the table to gain coverage; no existing entry is affected |
| changed or removed | a call selector the table already covers now resolves elsewhere, or is gone | REMAP DETECTED — the frozen table may mislabel calls; update immediately |

Every affected selector is listed with both the frozen and the on-chain facet, delegate
selector, function and integration id, in full.

The job never fails the run. An unreachable RPC or a missing secret exits quietly.

Run the same diff by hand with:

```
ETH_RPC_URL=... node scripts/generate-pau-dispatch.mjs --check
```

## Scope

The frozen tables cover two Controllers. The `PAUFactory`
`0x69A5d548830AC2A4Ba90A44a2C75BDA71f97fc66` has emitted eight `ControllerDeployed` events;
the other six Controllers are dormant after setup and are not covered.

| Controller | Wires frozen | Facets |
| --- | --- | --- |
| `0xbf83F5974B932c7D842254042717D6A2706CE5eE` | 47 | `BasinFacet`, `PSMFacet`, `UniswapV3Facet`, `USDSFacet` |
| `0x24169Afb34fAe4D4356BC54Bd80319131e35ca38` | 15 | `AaveFacet`, `USDSFacet` |

State-changing wires on Grove's Controller:

| Integration | Call selector | Delegate selector | Facet function |
| --- | --- | --- | --- |
| `USDS_FACET` | `0xa5b7e02d` | `0xa0712d68` | `mint(uint256)` |
| `USDS_FACET` | `0x48d63a13` | `0x42966c68` | `burn(uint256)` |
| `USDS_FACET` | `0xbc4bf322` | `0x6817031b` | `setVault(address)` |
| `PSM_FACET` | `0x8c88adef` | `0x115c48d5` | `swapUSDCToUSDS(uint256)` |
| `PSM_FACET` | `0x3f45168c` | `0x5acb7053` | `swapUSDSToUSDC(uint256)` |
| `BASIN_FACET` | `0xe4696d83` | `0x20e8c565` | `deposit(address,address,uint256,uint256)` |
| `BASIN_FACET` | `0xa51e3864` | `0x7bfe950c` | `withdraw(address,address,uint256,uint256)` |
| `UNISWAP_V3_FACET` | `0xf8692e56` | `0xb40b7e0b` | `swap(address,address,uint256,uint256,uint24)` |
| `UNISWAP_V3_FACET` | `0x1c72ed54` | `0x4443e82d` | `addLiquidity(address,uint256,(int24,int24),(uint256,uint256),(uint256,uint256),uint256)` |
| `UNISWAP_V3_FACET` | `0x669ca079` | `0x69ee06c3` | `removeLiquidity(address,uint256,uint128,(uint256,uint256),uint256)` |
| `UNISWAP_V3_FACET` | `0x140aad6a` | `0x73d76dbe` | `setMaxSlippage(address,uint256)` |
| `UNISWAP_V3_FACET` | `0x25eb3da5` | `0x690b2c22` | `setMaxTickDelta(address,uint24)` |
| `UNISWAP_V3_FACET` | `0x3c32faa3` | `0xf380eb03` | `setTWAPSecondsAgo(address,uint32)` |
| `UNISWAP_V3_FACET` | `0x59301309` | `0x62f609da` | `setLiquidityLowerTickBound(address,int24)` |
| `UNISWAP_V3_FACET` | `0xb1068e83` | `0x916afd77` | `setLiquidityUpperTickBound(address,int24)` |

The remaining 32 wires are views. They are frozen too, so a view included in a batch decodes
rather than reading as unknown.

State-changing wires on Controller `0x24169Afb34fAe4D4356BC54Bd80319131e35ca38`:

| Integration | Call selector | Delegate selector | Facet function |
| --- | --- | --- | --- |
| `AAVE_FACET` | `0x0599d5f2` | `0x47e7ef24` | `deposit(address,uint256)` |
| `AAVE_FACET` | `0xdb42c44d` | `0xf3fef3a3` | `withdraw(address,uint256)` |
| `AAVE_FACET` | `0x0c61b8e5` | `0x73d76dbe` | `setMaxSlippage(address,uint256)` |
| `USDS_FACET` | `0xa5b7e02d` | `0xa0712d68` | `mint(uint256)` |
| `USDS_FACET` | `0x48d63a13` | `0x42966c68` | `burn(uint256)` |
| `USDS_FACET` | `0xbc4bf322` | `0x6817031b` | `setVault(address)` |

`0x73d76dbe` is the delegate selector of `setMaxSlippage(address,uint256)` on both
`UniswapV3Facet` and `AaveFacet`. The call selectors differ, and so do the facets.

## Test fixtures

Five fixtures under `packages/ui/src/dev/fixtures/` carry the real MultiSend payloads of five
executed mainnet transactions from Grove's allocator Safe
`0x9187807e07112359C481870feB58f0c117a29179`. The dev Safe API mock serves them by nonce.

| Nonce | Fixture | On-chain transaction |
| --- | --- | --- |
| 8 | `pau-usds-mint-basin-deposit` | `0xf1743edb3af61c1afd977d81f07f6ab86f9be2fc3f9c1b437d9dda6a89b9c463` |
| 9 | `pau-basin-withdraw-psm-burn` | `0x079475f4b28e2f14e2a031a91e49b7f55a8956a178411edef9ff8cb337808d11` |
| 10 | `pau-uniswap-v3-swap` | `0xe10ab6c75c5dcaab66bbfd8e6357e3689e539e5096ad6c120889631e9ea812f0` |
| 11 | `pau-uniswap-v3-add-liquidity` | `0xc216282df3644236c0c05bfebf1f3365ac2f0ef167fa6d309e0c3597d658f45f` |
| 12 | `pau-uniswap-v3-remove-liquidity` | `0x84e559568bab4ffe12b7070587094f314bf20fdaea62474974d8c3993474658e` |

Each fixture carries the real payload with the Safe address replaced by the mock sentinel
`0xfeEDfaCeFeEdFaceFEedFACefEEDFaCEfEeDfAce`. The recomputed hash therefore does not match the
recorded `safeTxHash`, and the app reports that rather than faking a pass.

`pau-agent.test.ts` reads these fixture files directly, so a fixture that stops decoding fails
the test suite rather than only looking wrong in a browser.

The mismatch path is tested against a synthetic `getDispatches` answer, not against altered
argument bytes. Altered arguments would produce a canonical call that still round-trips and
still resolves to the same function, which tests nothing. The failure this check exists for is
a rewired selector.

## What is not determined

- **Whether call selectors have recoverable names.** No naming scheme was tested against them.
- **Who operates the two allocator Safes.** Only that these two addresses originate the calls.
- **Which sub-DAO owns Controller `0x24169Afb34fAe4D4356BC54Bd80319131e35ca38`.**
- **Whether remapping is prevented anywhere in the contracts.** Absence over eleven weeks was
  measured. The code paths were not audited to establish whether a remap is prevented or
  merely unexercised.
- **The Safe Transaction Service's own decoding behaviour for these selectors.** No decoded
  data is expected, because the selectors are per-deployment and absent from any published
  ABI, but this was inferred from a fixture render rather than queried.
