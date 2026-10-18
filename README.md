# LEU Light Electron Uninstaller

LEU is a planned open source Windows uninstaller with a modern Electron interface. It will help people understand their installed software, run a program's own uninstaller, and review the files and settings left behind.

The central product principle is **explain every cleanup action before making it**. A useful result tells the user what LEU found, why it belongs to the selected program, and what keeping or removing it means.

## Project status

The project is at the architecture and planning stage. This repository currently contains project documentation; there is no runnable application yet.

Confirmed direction:

- Windows first.
- Electron for the desktop interface.
- Open source development.
- A clean interface, low background activity, and a small dependency footprint.
- More detail and control over uninstallation and leftovers.

The proposed first development target is Windows 11 on x64. The technical choices below are recommendations for implementation, with an early prototype to validate the Windows integration and performance.

## Product scope

The first useful release will show installed desktop programs with search, sorting, publisher, version, installation scope, and available size information. It will run supported vendor uninstallers, refresh the inventory afterward, and offer a read-only review of potential leftovers.

Recoverable cleanup follows once LEU can validate ownership, preserve selected files, and recover from interruptions. All cleanup selections start unchecked. Personal documents, application profiles, shared runtimes, and uncertain matches require particular care and are excluded from the initial cleanup capability.

Microsoft Store package support, batch uninstallation, installation monitoring, and advanced registry cleanup belong to later milestones. LEU will work locally without an account. Core discovery and cleanup will not depend on a cloud service.

## Architecture direction

Use Electron, TypeScript, and React for the interface and application workflow, with a small Rust helper for Windows APIs. Keep the interface running with normal user permissions. Request elevation only for a specific operation that needs it.

Electron bundles Chromium and Node.js, so its runtime creates a baseline footprint. LEU's lightweight goal therefore focuses on startup time, idle resource use, limited dependencies, and scans that run when requested. These are targets to measure, rather than claims of native utility size. See [Electron's overview](https://www.electronjs.org/).

## Project documents

- [Architecture](docs/ARCHITECTURE.md) covers components, Windows integration, data contracts, cleanup behavior, and performance targets.
- [Development roadmap](docs/ROADMAP.md) defines milestones, dependencies, acceptance criteria, and the first implementation tasks.

## Open source setup

Choose and add the project license before accepting code contributions or publishing source releases. The specific license, repository hosting, and release signing arrangements remain owner decisions. No license has been assigned by these planning documents.

The initial implementation milestone should also add contribution instructions, a security reporting route, and a documented local build. Review all new runtime dependencies and include their notices in releases.
