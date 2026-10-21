# LEU TODO

Open work from the October 2026 project review. Milestone scope and acceptance criteria live in [docs/ROADMAP.md](docs/ROADMAP.md); this list tracks concrete fixes and follow-ups.

## Before M1 (blocking)

- [x] **Turn the engine client into a request/response client.** `src/main/engine-client.ts` only performs the handshake; any frame after `ready` is treated as `INVALID_RESPONSE`. Add a `request(method, params)` API, a pending map keyed by request id, a timeout per request, and rejection of all pending requests when the helper exits. Rebuild the handshake on top of it.
- [x] **Split the frame size limits.** `MAX_FRAME_BYTES` (16 KiB) applies to both directions, and a real inventory of ~300 programs will exceed it. Keep a small request limit and add a separate, larger response limit (for example 8 MiB) on both the TypeScript and Rust sides, with tests.
- [x] **Type each engine method.** `native/engine/src/lib.rs` hard-codes `params: EmptyParams` and a single `engine.version` method. Replace it with a serde-tagged method enum so each method has `deny_unknown_fields` params, keeping `UNKNOWN_METHOD` and `INVALID_REQUEST` behavior.
- [x] **Single source of truth for the protocol.** The JSON schemas, TypeScript types, and Rust structs are maintained by hand, and the error code list is already duplicated. Generate the schema from Rust (for example `schemars`) and the TypeScript types from the schema, and check for drift in CI.

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

## Protocol review follow-ups

From the 2026-10-21 code review of the request multiplexing and contract generation commits.

- [ ] `scripts/contracts.mjs` parses the generator output on the child's `exit` event, which can fire before stdout has drained. A truncated read makes `JSON.parse` throw inside the event handler, outside the `try`, so `pnpm contracts:check` can fail intermittently. Wait for `close` and reject on parse errors.
- [ ] Check the protocol version before strict envelope validation, on both sides. `src/main/engine-client.ts` runs `isEngineResponse` (`additionalProperties: false`) first, and the Rust `Envelope` uses `deny_unknown_fields` before comparing versions. A future envelope change is reported as `INVALID_RESPONSE` or `INVALID_REQUEST` instead of `PROTOCOL_MISMATCH`.
- [ ] `engine_methods!` in `native/engine/src/lib.rs` declares `-> $result` but does not tie it to the handler's return type, because `success()` takes `impl Serialize`. Let the macro generate the dispatch arms so the exported result schema cannot drift from what is sent.
- [ ] `EngineClient.stop()` leaves `status` as `ready` after stopping a connected helper. During `restart()`, `leu:engine-status` returns a stale `ready` while the old helper shuts down, and no status event is emitted.
- [ ] The Smart App Control hint in `CONTRIBUTING.md` suggests `cargo clean -p leu-engine` without `--target x86_64-pc-windows-msvc`. The scripts build into `target/x86_64-pc-windows-msvc`, so the blocked binary is probably not removed. Verify, and mention the repo-local `.tools/cargo` toolchain.
- [ ] The generated `EngineVersionParams` is `{}`, which accepts any non-nullish value in TypeScript, so bad params only fail at runtime. Generate `Record<string, never>` for closed empty-object schemas.
- [ ] Client-side request rejections in `EngineClient.send()` use the remote code `INVALID_REQUEST`, so callers cannot tell them from engine-reported errors. Add a local code to `EngineErrorCode`.
- [ ] Native tests and Clippy run only with `--all-features`, so the shipped default-feature build is never linted or tested. Add a default-feature Clippy (and test) pass in `scripts/native.mjs`.
- [ ] `scripts/contracts.mjs` titles the error-code type through the hard-coded path `response.oneOf[1].properties.error.properties.code`. Set the title in Rust instead, for example `#[schemars(title = "EngineRemoteErrorCode")]` on `ErrorCode`.
- [ ] The request and response envelope schemas in `native/engine/src/contract.rs` are hand-written and duplicate the rules in `Envelope`, `handle_frame`, `success`, and `failure`. Derive them from typed request and response structs so the envelope is generated too, not only the method payloads.

## M3 design (no implementation yet)

- [x] Document server-pushed events (progress, phases) and request cancellation in the protocol. The engine is currently single-threaded and synchronous, so a running scan cannot receive `cancelScan`.

## Hardening

- [ ] Evaluate enabling the `EnableEmbeddedAsarIntegrityValidation` fuse.
- [ ] Set the `GrantFileProtocolExtraPrivileges` fuse to `false`. The app uses the `leu://` protocol, not `file://`.
- [ ] The smoke test's helper-exit check (`process.kill(pid, 0)`) can be fooled by PID reuse. Consider checking process creation time as well.

- [ ] Plan code signing for both `LEU.exe` and `leu-engine.exe` as a release requirement. Smart App Control (on by default for many Windows 11 installations) blocks unsigned executables without reputation. On 2026-10-21 it intermittently blocked freshly built development binaries on the main development machine (os error 4551).

## Performance

- [ ] Measure startup without Chromium remote debugging attached (for example, timestamps logged by the app). The 5.58 s M0 figure includes CDP attachment and first-launch Defender scanning of an unsigned executable. On 2026-10-21 the smoke test measured 15.5 s on the first launch of a fresh build, then 0.25 s and 0.24 s on the next two launches, so first-launch scanning dominates. Measure cold and warm launches separately.
- [ ] Run the roadmap benchmark as defined: 30 cold launches and a 60-second idle sample.
- [ ] Verify a clean build on a fresh Windows VM outside CI (still open in docs/M0.md).

## Product

- [ ] Position LEU against Bulk Crap Uninstaller, Revo, and Geek Uninstaller. Lead with explained evidence, recoverable cleanup, and the interface.
- [ ] Consider tightening the path to the first useful alpha (M2 + M3). M1 alone mostly duplicates Windows Settings.
- [ ] Decide whether to keep "Light Electron" prominent in the branding or lead with "LEU".

## Website (separate repository: KaroqDave/leu-website)

- [x] Use the operator's real full name in the Impressum and copyright notices (§5 DDG).
- [x] Remove the Cloudflare account subdomain link from the website README.
- [x] Update the screenshot credit in `docs/images/README.md` (added on GitHub in 8029831) from the old operator name to David Fuhrmann.
- [x] Keep the `workers.dev` route and the old commit history as they are (decided 2026-10-21).
