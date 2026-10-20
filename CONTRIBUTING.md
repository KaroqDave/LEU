# Contributing to LEU

LEU currently targets Windows 11 x64. M0 provides the desktop shell, a demo program provider, and a Rust version handshake. The application does not yet enumerate or uninstall real programs.

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
```

The executable is `out/LEU-win32-x64/LEU.exe`. Keep its entire directory together. The helper is a separate resource at `resources/leu-engine.exe`, outside `app.asar`. `pnpm make` creates a Windows zip under `out/make`; M0 artifacts are unsigned development builds.

The smoke test launches the packaged executable, connects a temporary Chromium debugging session, checks the restricted renderer and real helper handshake, exercises navigation and search, reconnects the helper, and verifies normal shutdown. It saves screenshots and a small performance baseline under `out/smoke`. No separate Playwright browser download is needed because the test uses Electron's Chromium.

## Checks

```powershell
pnpm check
pnpm package
pnpm smoke
```

Individual commands are `pnpm typecheck`, `pnpm test`, `pnpm test:native`, `pnpm lint:native`, and `pnpm format:check`. Use `pnpm format` for JavaScript, TypeScript, CSS, and supported configuration files; use `cargo fmt --all` for Rust. Build the native helper with `pnpm build:native`.

TypeScript tests cover message validation, framing and size limits, request multiplexing, helper startup and failure behavior, resource paths, and sample search behavior. Rust tests cover the engine's framing, request and response limits, request validation, method allowlist, version mismatch, and EOF behavior. Keep the shared request fixture compatible with both implementations.

If a check fails with `os error 4551` ("An application control policy has blocked this file"), Windows Smart App Control blocked a newly built unsigned binary. Windows keeps blocking that exact file. Rebuild it, for example with `cargo clean -p leu-engine` followed by the failing command, or rely on the CI run. Do not disable security features to work around it.

## Boundaries to preserve

The renderer calls named methods on `window.leu`. Add or change the shared bridge type when an action is introduced; do not expose raw IPC, shell commands, or native filesystem handles. Validate the sending window and frame in main process handlers.

The helper uses bounded newline delimited JSON on private stdin and stdout: 16 KiB per request and 8 MiB per response. Reserve stdout for protocol frames and stderr for diagnostics. Version requests are the only supported native action in M0. The demo provider is explicit and independent of the native engine; a helper failure must never cause fabricated live inventory.

The Rust engine is the single source of the protocol contract. To add an engine method, declare it in the `engine_methods!` list in `native/engine/src/lib.rs` with its parameter and result types (deriving `JsonSchema` under the `schema` feature), and handle it in `handle_frame`. Then run `pnpm contracts`, which regenerates `src/contracts/contract.json` and `src/contracts/generated.ts`, and call the method through `EngineClient.request`. Never edit the generated files by hand. `pnpm check` and CI fail when they differ from the engine. See the helper protocol section of the [architecture](docs/ARCHITECTURE.md).

Keep destructive integration tests inside disposable Windows VMs once uninstall and cleanup operations exist. Never use a contributor's installed applications as deletion fixtures.

## Pull requests

Describe the user visible change, why it is needed, and the relevant checks. Add regression coverage for new protocol behavior and system operations. New native dependencies, cleanup rules, and privileged methods need an explanation of the affected resources and failure handling.

Contributions use the [MIT license](LICENSE). See [SECURITY.md](SECURITY.md) for reporting guidance and [the roadmap](docs/ROADMAP.md) for milestone scope.
