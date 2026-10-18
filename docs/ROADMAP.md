# LEU development roadmap

Build a useful Windows inventory and uninstall workflow before enabling LEU to remove leftovers. Each milestone has a release gate, so modern interface work and system behavior can advance together without making cleanup depend on untested assumptions.

The initial target is Windows 11 x64. Milestone numbers express dependency order rather than delivery dates. The sequence assumes a small team and should be scheduled after the foundation prototype establishes the native integration cost.

M0 now has a working implementation. See [M0 status](M0.md) for completed checks, baseline measurements, and repository and release setup. M1 live inventory has not started.

## Release sequence

| Milestone | Deliverable | Required before proceeding |
| --- | --- | --- |
| M0 Foundation | Buildable Electron shell, contracts, and a minimal Rust helper | A packaged build can start its helper and report a protocol mismatch clearly. |
| M1 Inventory | Searchable read-only installed program browser | Reliable discovery across installation scopes and registry views without modifying the system. |
| M2 Uninstallation | Supported vendor uninstallers and operation history | Launch, cancellation, failures, and uncertain outcomes are reported accurately. |
| M3 Leftover review | Bounded scans with evidence and no deletion | False ownership matches are rejected in the defined test matrix. |
| M4 Recoverable cleanup | Selected application caches moved to quarantine | Recovery, interruption, identity checks, and permission boundaries pass integration tests. |
| M5 Public beta | Documented, signed, reproducible build instructions and release artifacts | Release checks pass on clean supported machines. |

M1 can be shared as a read-only preview. M2 and M3 together form the first uninstall alpha. M4 and M5 form the first public cleanup beta. Registry mutation remains outside this first beta.

## M0 Foundation

Create the Electron, TypeScript, and React application with one window, a restricted preload bridge, and a Rust helper that answers a version request. Use Electron Forge's webpack TypeScript template as the starting build pipeline. Keep the real Windows provider behind an interface so the UI can also use deterministic fixtures.

Establish application identity, the repository license, contribution instructions, a security reporting route, formatting, strict type checking, dependency lockfiles, and Windows CI. License selection is an owner decision to settle before accepting contributions.

Prove the production boundary early: package the helper as an application resource, resolve its installed path, launch it without a shell, exchange a versioned message, and handle missing, incompatible, or crashed helpers. Test paths containing spaces and non ASCII characters.

Acceptance criteria:

- A contributor can build and package from documented steps on a clean Windows development machine.
- The packaged app opens without elevation and closes without orphaning its helper.
- Renderer code has no direct Node, registry, or native engine access.
- Unknown methods, oversized messages, and protocol mismatches fail with structured errors.
- The window shows Installed apps, Activity, and Settings navigation with fixture data clearly identified as such.
- Startup, idle resource use, and package size have a recorded baseline.

## M1 Installed program inventory

Implement registry discovery for the current user and machine, including the relevant x86 and x64 registry views. Preserve provenance and installation scope. Retain separate records for independently registered installations with identical names.

Build search, sorting, filtering, a program details panel, lazy icons, refresh, empty states, and partial error states. Label size and date metadata accurately; missing values must not become fabricated zeros or dates. Only expose capabilities that the provider supports.

Acceptance criteria:

- Test fixtures cover missing metadata, duplicate display names, both scopes, both registry views, malformed values, inaccessible records, and Unicode paths.
- Inventory does not launch installers, request elevation, or write to system locations.
- Long lists remain responsive, and details can be opened entirely by keyboard.
- Refresh preserves a valid selection and handles a program disappearing while selected.
- Live results are compared with known installations in disposable Windows VMs; differences have explanations rather than forced counts matching Settings.

## M2 Supported vendor uninstallation

Add uninstall preparation, a review screen, launch, progress, refreshed inventory, and activity history. Start with validated MSI product codes and unambiguous executable uninstallers. Keep unsupported command forms visible with an explanation and a route to Windows Installed apps.

Introduce the engine owned operation journal. Preserve the pre-uninstall program identity and available ownership evidence for later scans. Serialize uninstall operations during the initial release.

Acceptance criteria:

- Ambiguous command lines and unsupported shell or script commands are rejected without execution.
- Tests cover quoted executable paths, missing files, malformed registry values, stale plans, and changed uninstall records.
- Declined UAC, vendor cancellation, failure, restart requirements, and detached child launchers produce distinct outcomes.
- LEU refreshes relevant inventory after an observed completion and reports conflicting or missing evidence honestly.
- Closing or crashing LEU while a vendor uninstaller runs does not cause a second launch on restart; history marks the unresolved state.
- The interface explains that vendor uninstall changes cannot be undone by LEU.

Run actual uninstall tests only against disposable test applications inside restorable VMs.

## M3 Leftover scan and review

Implement a bounded scan for one program at a time. Start with a small set of reviewed application rules and saved inventory metadata. Show the precise location, ownership evidence, category, and removal implications for each result.

This milestone offers review only. Separate shared resources, personal data, and uncertain matches from items that may later qualify for recoverable cleanup. Keep all selections unchecked when selection is introduced.

Acceptance criteria:

- Scan results are repeatable against synthetic filesystem fixtures.
- A same-name program, shared publisher directory, shared runtime, and surviving installation do not create eligible cleanup candidates.
- Rules cannot target broad system directories, user profile roots, or arbitrary renderer supplied paths.
- Scans have bounded concurrency, report partial access failures, and support cancellation.
- Candidate sizes distinguish an estimate from a complete measurement.
- No scan deletes files, changes the registry, or requires elevation merely to complete the ordinary workflow.

Ship the uninstall alpha after M2 and M3. Use feedback to improve the list, program details, and result explanations before increasing cleanup scope.

## M4 Recoverable file cleanup

Enable explicit selection of a narrow category: application specific caches with reviewed ownership rules. Implement an immutable cleanup plan, final review, resource revalidation, quarantine, and recovery. Expand to other categories only after their preservation and restore behavior is defined.

Start with current user resources. Before machine scope actions are enabled, implement and test the temporary elevated broker, authenticated pipe, protected backup storage, and independent policy checks described in the architecture.

Acceptance criteria:

- An item remains untouched when backup, metadata preservation, validation, or permission checks fail.
- Tests cover junctions, symbolic links, path swaps, long paths, locked files, unavailable volumes, low disk space, and unsupported filesystem features.
- Terminating LEU or its engine at each journal transition produces an explainable, recoverable state on restart.
- Recovery preserves supported file metadata and reports destination conflicts without overwriting newer content.
- UAC cancellation leaves the operation in a defined state; a different administrator account cannot redirect a cleanup to that account's profile.
- The interface distinguishes quarantined bytes from reclaimed disk space and offers explicit restore or permanent removal.
- Personal documents, profiles, shared resources, registry mutations, and unsupported locations remain outside this release's cleanup capability.

Complete a focused review of the mutation and elevation boundaries before exposing protected cleanup to beta users. A favorable test matrix supports only the rules and resource types it exercises; adding a new rule can expand the affected data and needs review.

## M5 Public beta

Prepare release builds, sign the application and helper, publish checksums and dependency notices, and document build provenance. Decide who owns the signing credentials and where release artifacts are hosted. Keep secrets outside the repository.

Document supported Windows versions, supported uninstall methods, cleanup categories, recovery limits, and known issues. Add user invoked diagnostic export with a preview and path redaction. Provide a clear uninstall path for LEU itself and an explicit choice about retained recovery data.

Acceptance criteria:

- CI passes type checks, relevant UI and engine tests, contract compatibility checks, and a packaged startup smoke test.
- Clean Windows machines can install, launch, perform a supported workflow, restore LEU cleanup, and uninstall LEU.
- Standard user operation works without a permanent elevated service or startup task.
- Recorded startup, memory, CPU, and package measurements accompany the release; unexplained regressions are resolved before release.
- Release artifacts have verifiable signatures and checksums, and required third party notices are present.
- Any update mechanism verifies authenticity before installation. Until it is implemented and tested, releases use a documented manual update path.

Reproducible build instructions are required here. Byte identical reproducible artifacts, especially after signing, are a separate goal to validate rather than assume.

## Work after the first beta

Prioritize these according to actual user feedback and test capacity:

1. Current user Microsoft Store and MSIX inventory, followed by supported package removal through Windows deployment APIs.
2. More application rules and cleanup categories, with fixtures and recovery requirements for each addition.
3. Registry leftover review, then carefully scoped registry mutation with typed backups and conflict aware restoration.
4. Queued batch uninstall with per-program review and serial execution.
5. Windows ARM64 and additional Windows version support after native builds and compatibility tests exist.
6. Optional installation snapshots and monitoring after storage, performance, and privacy costs are understood.

Force removal, services and drivers, shell extension cleanup, scheduled task deletion, arbitrary registry cleaning, and boot time deletion have larger system impact. Give each its own design and validation milestone if the project later adopts it. macOS and Linux need their own discovery and removal engines rather than reuse of Windows cleanup rules.

## First implementation backlog

| Order | Task | Visible result |
| --- | --- | --- |
| 1 | Settle the license and create the documented Electron and TypeScript build | A contributor can open the development window. |
| 2 | Add the Rust helper and protocol handshake | The packaged window displays the engine version or a useful error. |
| 3 | Add a fixture provider and installed program view | Search, selection, details, and unknown metadata behavior can be reviewed. |
| 4 | Implement registry enumeration and normalization | The same view shows real installed desktop programs. |
| 5 | Add refresh, source errors, keyboard interaction, and lazy icons | The read-only workflow is usable across realistic inventories. |
| 6 | Record packaged performance and verify a clean build | M0 and M1 can be evaluated against concrete evidence. |

Use the [architecture](ARCHITECTURE.md) for component boundaries and data contracts. The first implementation checkpoint is the read-only installed program browser with a working packaged helper.
