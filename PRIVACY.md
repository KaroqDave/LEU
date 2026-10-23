# Privacy in LEU

This describes the current M1 inventory preview. Documentation and support live in this repository; the project website has been retired.

## Current data handling

- Normal launches read installed desktop registrations from the current user's uninstall registry key and the machine's 32-bit and 64-bit views. This includes names, publishers, versions, reported sizes and dates, installation locations, system-component flags, parent-registration and release-type update markers, and registry provenance. Registry warnings can contain registration key names. Discovery does not scan personal files or installation directories, read uninstall command lines, run uninstallers, write registry values, or request elevation.
- The app and its bundled Rust helper communicate locally over private stdin and stdout. Inventory and source errors stay in process memory; LEU does not implement an inventory database or automatically export the result. The helper also returns its version, protocol version, platform, and architecture.
- Explicit `--demo-inventory` mode uses bundled synthetic records, including paths under `C:\Users\Demo`, and labels them as sample data. Failures in normal discovery never switch to sample data.
- LEU has no account system, analytics, telemetry, advertising, automatic update checks, or automatic crash-report uploads. It does not send inventory, search text, or paths to a server.
- The packaged app loads bundled assets and blocks HTTP, HTTPS, WebSocket, and other external requests in its Electron browser session. It denies permission requests, external navigation, new windows, and webviews. The Rust helper has no networking code. Future main-process or native networking needs explicit review; the browser-session block does not govern Node.js or native network APIs.

## Local files and diagnostics

Electron creates per-user application data and cache files in its `userData` and `sessionData` locations (normally under `%APPDATA%\LEU` on Windows). A `--user-data-dir` override changes the profile location. Local runtime files can remain after closing the app; LEU does not promise to leave no files behind or encrypt these files itself.

The current build does not implement a persistent inventory database, operation journal, recovery store, or diagnostic export. Helper stderr is discarded by the app. Startup failures can write an error to the launching console, and developer-enabled Chromium logging or OS diagnostics can contain local paths and other details. No LEU service receives these diagnostics automatically.

Development and test tools differ from normal packaged use: dependency installation downloads tools and packages, Forge uses a local development server, and the smoke test enables a loopback debugging endpoint. Smoke screenshots, the isolated test profile, and hardware/process measurements are kept in ignored `out/smoke` and `.cache` directories. Review them before sharing.

## Sharing reports and contributions

GitHub issues, pull requests, commit metadata, and attachments can be public. GitHub and linked third-party services handle visits under their own policies. LEU does not automatically submit reports or attachments.

Use synthetic examples and demo captures. Before sharing, remove usernames, personal file paths, email addresses, device or network names, installed software lists, credentials, tokens, and unrelated windows or notifications. Crop screenshots and check embedded image metadata. Share the minimum redacted error text needed to reproduce a problem, rather than an entire profile, log directory, or crash dump.

Use [private vulnerability reporting](https://github.com/KaroqDave/LEU/security/advisories/new) for suspected security or privacy leaks; see [SECURITY.md](SECURITY.md). Keep reports minimal even in a private channel.

Ignored files are not automatically safe to share, and ignore rules do not remove already tracked content. These repository changes do not erase old commits, forks, caches, or copies previously published elsewhere. If a credential is exposed, revoke or rotate it and report it privately; deleting the current file alone is insufficient.

## Future capabilities

Uninstall, cleanup, recovery, diagnostic export, and release checks remain planned work. Their data handling must be documented when implemented. Inventory and recovery data are intended to stay local. Diagnostic export must be user initiated, previewable, and redacted, and any future release-check networking must be separate from core operation. These are requirements for future work, not features available in the current preview.
