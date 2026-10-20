# LEU TODO

Open work from the October 2026 project review. Milestone scope and acceptance criteria live in [docs/ROADMAP.md](docs/ROADMAP.md); this list tracks concrete fixes and follow-ups.

## Before M1 (blocking)

- [ ] **Turn the engine client into a request/response client.** `src/main/engine-client.ts` only performs the handshake; any frame after `ready` is treated as `INVALID_RESPONSE`. Add a `request(method, params)` API, a pending map keyed by request id, a timeout per request, and rejection of all pending requests when the helper exits. Rebuild the handshake on top of it.
- [ ] **Split the frame size limits.** `MAX_FRAME_BYTES` (16 KiB) applies to both directions, and a real inventory of ~300 programs will exceed it. Keep a small request limit and add a separate, larger response limit (for example 8 MiB) on both the TypeScript and Rust sides, with tests.
- [ ] **Type each engine method.** `native/engine/src/lib.rs` hard-codes `params: EmptyParams` and a single `engine.version` method. Replace it with a serde-tagged method enum so each method has `deny_unknown_fields` params, keeping `UNKNOWN_METHOD` and `INVALID_REQUEST` behavior.
- [ ] **Single source of truth for the protocol.** The JSON schemas, TypeScript types, and Rust structs are maintained by hand, and the error code list is already duplicated. Generate the schema from Rust (for example `schemars`) and the TypeScript types from the schema, and check for drift in CI.

## M1 preparation

- [ ] Remove demo-specific assumptions from the UI:
  - [ ] The hard-coded `"Installer estimates · 1 size unknown"` stat detail in `src/renderer/App.tsx`.
  - [ ] The default `selectedId` of `'demo-code'`.
  - [ ] When a filter hides the selected program, the details panel silently switches to the first visible row. Decide the intended behavior.
- [ ] Reconsider the "Reported size" total. Summed registry `EstimatedSize` values are often wrong or missing. Drop the total, or label it clearly as a partial installer estimate.
- [ ] Move `initials` and `color` out of the `Program` contract. They are presentation details and belong in the renderer.
- [ ] Split `App.tsx` (578 lines) into per-view components before adding loading, refresh, and partial error states.
- [ ] Add ESLint with `eslint-plugin-react-hooks`.
- [ ] Capture the last few KB of helper stderr instead of discarding it (`child.stderr.resume()`), for crash diagnostics.

## M3 design (no implementation yet)

- [ ] Document server-pushed events (progress, phases) and request cancellation in the protocol. The engine is currently single-threaded and synchronous, so a running scan cannot receive `cancelScan`.

## Hardening

- [ ] Evaluate enabling the `EnableEmbeddedAsarIntegrityValidation` fuse.
- [ ] Set the `GrantFileProtocolExtraPrivileges` fuse to `false`. The app uses the `leu://` protocol, not `file://`.
- [ ] The smoke test's helper-exit check (`process.kill(pid, 0)`) can be fooled by PID reuse. Consider checking process creation time as well.

## Performance

- [ ] Measure startup without Chromium remote debugging attached (for example, timestamps logged by the app). The 5.58 s M0 figure includes CDP attachment and first-launch Defender scanning of an unsigned executable.
- [ ] Run the roadmap benchmark as defined: 30 cold launches and a 60-second idle sample.
- [ ] Verify a clean build on a fresh Windows VM outside CI (still open in docs/M0.md).

## Product

- [ ] Position LEU against Bulk Crap Uninstaller, Revo, and Geek Uninstaller. Lead with explained evidence, recoverable cleanup, and the interface.
- [ ] Consider tightening the path to the first useful alpha (M2 + M3). M1 alone mostly duplicates Windows Settings.
- [ ] Decide whether to keep "Light Electron" prominent in the branding or lead with "LEU".

## Website (separate repository: KaroqDave/leu-website)

- [ ] Confirm the Impressum operator name meets §5 DDG (the real full name is required; a pseudonym is not sufficient).
- [ ] If a pseudonym is intended for other public material, note that the public README links `leu-website.davidfuhrmann1.workers.dev`, which shows the account name.
