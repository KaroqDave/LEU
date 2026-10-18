# Security reporting for LEU

LEU is an early development project. M0 exposes a version handshake and demo inventory; real uninstall and cleanup operations are planned for later milestones. Development builds are unsigned.

## Report a vulnerability privately

Use [GitHub's private vulnerability reporting form](https://github.com/KaroqDave/LEU/security/advisories/new), also available through the repository's Security tab and Report a vulnerability action. Include the affected revision, reproduction steps, expected behavior, and observed impact. Use synthetic paths and data where possible.

Do not publish credentials, personal inventory, or exploit details in ordinary public issues. Use [public issues](https://github.com/KaroqDave/LEU/issues) for non-sensitive bugs and feature requests.

## Relevant boundaries

Report issues involving renderer access to native capabilities, IPC sender checks, protocol validation, helper execution, packaged resource access, and any future elevation or cleanup behavior. Never test a suspected cleanup issue against irreplaceable data.

Only the current development revision is maintained at this stage. Release support and disclosure timelines will be defined before public beta.
