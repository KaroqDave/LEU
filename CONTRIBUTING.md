# Contributing to LEU

LEU currently targets Windows 11 x64. The M1 preview provides read-only desktop program discovery through a Rust helper and a restricted Electron interface. Uninstall and cleanup operations are not implemented.

## Development tools

Install these before building:

- Node.js 24 LTS and pnpm 11.25.0. The minimum supported Node version is 22.13.0.
- Rust through [rustup](https://rust-lang.org/tools/install/). The repository pins Rust 1.99.1 with the MSVC target, rustfmt, and Clippy in `rust-toolchain.toml`.
- Visual Studio 2022 Build Tools with Desktop development with C++ and a Windows SDK.

The native build script also recognizes a workspace local rustup installation under `.tools/cargo` and `.tools/rustup`. This is an optional development convenience; the normal contributor setup uses Cargo on PATH. Local tools, caches, and build artifacts are ignored by Git.

## Build and run

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

The first launch downloads the pinned Electron runtime if it is not cached. Rust may download the pinned toolchain and crates. The start script builds the release helper before starting Forge. No administrator privileges are required to run the application.

To create and test a standalone build:

```powershell
pnpm package
pnpm smoke
pnpm smoke:inventory
```

The executable is `out/LEU-win32-x64/LEU.exe`. Keep its entire directory together. The helper is a separate resource at `resources/leu-engine.exe`, outside `app.asar`. `pnpm make` creates a Windows zip under `out/make`; current artifacts are unsigned development builds.

The smoke test launches the packaged executable with explicit `--demo-inventory` sample mode, connects a temporary Chromium debugging session, checks the restricted renderer and real helper handshake, exercises navigation and search, reconnects the helper, and verifies normal shutdown. It saves synthetic screenshots and a small performance baseline under `out/smoke`. `pnpm smoke:inventory` separately verifies the shipped helper and normal application's live provider, schema, bounded rows, keyboard selection, refresh, and shutdown; it prints aggregate counts and never saves an inventory or screenshots. No separate Playwright browser download is needed because the tests use Electron's Chromium.

If Windows application control blocks the unsigned packaged `LEU.exe`, `pnpm smoke:inventory -- --development` verifies the shipped helper and live UI through the ordinary Forge development launcher. This does not verify packaged startup or its production session policy. Keep those release checks open until they can run on a permitted test machine; do not weaken Windows security settings.

## Privacy when developing and sharing

Read [PRIVACY.md](PRIVACY.md) before sharing reports or captures. Use synthetic fixtures and the app's demo inventory. Review screenshots for personal paths, account names, notifications, and unrelated windows; review text for credentials, installed software, and machine identifiers. Never commit real inventories, user profiles, raw logs, crash dumps, signing keys, or local credentials. Ignore rules reduce accidental additions but do not sanitize files or Git history.

The smoke profile in `.cache/smoke-profile` and captures and measurements in `out/smoke` stay local and are ignored by Git. The baseline includes OS and hardware details and process IDs; do not upload it without reviewing and redacting it. The debugging endpoint is enabled only by the smoke command and binds to loopback. Close the test app when finished.

Packaged builds block browser-session network requests. Development uses Forge's local HTTP and WebSocket server, and dependency installation can contact external registries. Production JavaScript and CSS omit source maps. The release helper build remaps workspace, home, Cargo, and Rust toolchain paths to generic prefixes while retaining the static C runtime. Custom compiler flags and new dependencies require another artifact check before sharing a build.

## Checks

```powershell
pnpm check
pnpm package
pnpm smoke
pnpm smoke:inventory
```

Individual commands are `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:native`, `pnpm lint:native`, and `pnpm format:check`. ESLint checks application code, scripts, and tests, including the recommended TypeScript and React Hooks rules, and fails on warnings. Generated protocol types and local build artifacts are excluded. Use `pnpm format` for JavaScript, TypeScript, CSS, and supported configuration files; use `cargo fmt --all` for Rust. Build the native helper with `pnpm build:native`.

TypeScript tests cover message validation, framing and size limits, request multiplexing, helper failures, inventory state transitions, resource paths, search, filtering, and unknown metadata. Rust tests use synthetic registry-reader fixtures for duplicate registrations, missing or malformed metadata, dates, Unicode paths, inaccessible records and sources, and collection limits. They never create registry fixtures on the contributor's machine. Keep the shared request fixture compatible with both implementations.

If a check fails with `os error 4551` ("An application control policy has blocked this file"), Windows Smart App Control blocked a newly built unsigned binary. Windows keeps blocking that exact file. Run `node scripts/native.mjs clean`, then repeat the failing command to rebuild it, or rely on the CI run. The clean script runs `cargo clean -p leu-engine --target x86_64-pc-windows-msvc` against the same target directory as the builds and automatically selects the repo-local `.tools/cargo` and `.tools/rustup` toolchain when present. A plain `cargo clean -p leu-engine` can leave target-specific binaries behind. Do not disable security features to work around it.

## Boundaries to preserve

The renderer calls named methods on `window.leu`. Add or change the shared bridge type when an action is introduced; do not expose raw IPC, shell commands, or native filesystem handles. Validate the sending window and frame in main process handlers.

The helper uses bounded newline delimited JSON on private stdin and stdout: 16 KiB per request and 8 MiB per response. Reserve stdout for protocol frames and stderr for diagnostics. Supported methods are `engine.version` and `inventory.list`; neither accepts paths or commands. The `windows-sys` dependency supplies Windows registry bindings. Discovery opens handles with read permissions and does not read uninstall command lines, inspect installation directories, invoke installers, or request elevation. Source and field failures produce partial results. The demo provider requires explicit `--demo-inventory`; a helper failure must never cause fabricated live inventory.

The Rust engine is the single source of the protocol contract. To add an engine method, declare it in the `engine_methods!` list in `native/engine/src/lib.rs` with its parameter and result types (deriving `JsonSchema` under the `schema` feature) and its handler. The macro generates dispatch and checks the handler's return type. Then run `pnpm contracts`, which regenerates `src/contracts/contract.json` and `src/contracts/generated.ts`, and call the method through `EngineClient.request`. Request and response envelope schemas are derived from the structs used by the engine. Never edit the generated files by hand. `pnpm check` and CI fail when they differ from the engine. Native tests and Clippy check both default features and all features. See the helper protocol section of the [architecture](docs/ARCHITECTURE.md).

Keep destructive integration tests inside disposable Windows VMs once uninstall and cleanup operations exist. Never use a contributor's installed applications as deletion fixtures.

## Pull requests

Describe the user visible change, why it is needed, and the relevant checks. Add regression coverage for new protocol behavior and system operations. New native dependencies, cleanup rules, and privileged methods need an explanation of the affected resources and failure handling.

Contributions use the [MIT license](LICENSE). See [SECURITY.md](SECURITY.md) for reporting guidance and [the roadmap](docs/ROADMAP.md) for milestone scope.
