# Changelog

All notable changes to this project are documented here.

## [0.3.0] — 2026-08-05

New protocol decoders, a Sourcify decoding fallback with proxy resolution, a
transaction lifecycle timeline, and hardening of the decoded-data verification.

### Added

- **SPBEAM and StUsdsRateSetter decoders.** Human-readable decoding for two Sky
  rate-setting contracts the Safe Transaction Service does not decode. Rates
  show basis points and percentage; ilk identifiers show their ASCII label
  alongside the full `bytes32`. Each decoding is re-encoded and byte-compared
  against the raw calldata before it is shown.
- **Sourcify ABI fallback.** When the Safe API returns no decoded data, the tool
  fetches the contract's verified ABI from Sourcify and decodes with it,
  re-encode-verified before display. It **follows EIP-1967 proxies to their
  implementation**, so proxied calls (for example Aave `supply(...)`) decode
  rather than showing as undecodable. Controlled by a Settings toggle, on by
  default; turning it off makes no request to Sourcify.
- **Transaction lifecycle timeline.** The detail view shows when a transaction
  was proposed, each signature, and whether it was rejected, superseded, or
  executed — with the signer/executor for each and the local time zone. The
  transaction list shows a compact version of the same.
- **My Safes management.** Add, edit, and remove personal Safe shortcuts in
  Settings, with clearer CSV templates.

### Changed

- **Decoded-data verification is now three-state.** A proven mismatch between a
  decoding and the signed bytes is shown in red as a stop-signing signal; a
  decoding that could not be checked is shown separately in amber as "not
  verified", rather than both appearing the same. This stops a "could not
  check" state from reading like tampering.
- **Undecodable calls show their bytes.** A call that neither the Safe API, a
  built-in decoder, nor Sourcify can decode now shows the function selector and
  the full calldata, instead of an empty "Decoded" pane. This applies to the
  top-level call and to each nested MultiSend call.
- **The Safe API "fallback" label is treated as "not decoded".** When the Safe
  service cannot decode a call it returns `method: "fallback"`; the tool no
  longer re-encode-checks that as a real function (which produced a false
  mismatch on legitimate calls) and instead routes it to the undecodable view.
- **Decoded-data verification is hardened against malformed API responses.**
  Parameter types are validated one at a time and parameter names are never
  parsed, so a hostile `dataDecoded` cannot inject a parameter that is encoded
  but not displayed.

### Fixed

- A Safe address pasted or linked in non-checksummed form now loads, instead of
  failing with "failed to load". The address is normalised to its checksum
  before the Safe API is queried.
- The Decoded pane no longer shows a previous transaction's decoding when
  switching between two transactions that share a nonce.
- Array parameters (for example `uint256[]`) are no longer reported as a
  verification mismatch on transactions that are correct.
- The CLI now labels the `To` address with built-in contract tags (SPBEAM,
  LockstakeEngine, USDS, and others), which were previously never applied.
- Corrected the checksum of a pinned contract address.

### Security

- The decoded-data verifier no longer builds its ABI by concatenating
  API-supplied parameter names and types into one string. Names and types from
  the Safe API are untrusted; each type is parsed independently and must yield
  exactly one parameter, so a decoding cannot claim fewer parameters than the
  call actually encodes.

[0.3.0]: https://github.com/0xShield3/sky-safe-tx-decoder/releases/tag/v0.3.0
