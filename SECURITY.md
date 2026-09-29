# Security policy

FlowForge runs automations on your own computer, so security matters. Thanks for helping keep it safe.

## Supported versions

Only the [latest release](https://github.com/Necromancervbh/Flowforge-/releases/latest) gets fixes.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately via **Security → Report a vulnerability** on this repository ([direct link](https://github.com/Necromancervbh/Flowforge-/security/advisories/new)).

Include what an attacker could do, the steps to reproduce it, and your OS and FlowForge version. You'll get a reply within a week.

## What FlowForge already protects against

- **Other websites:** the engine only listens on `127.0.0.1`, rejects foreign `Host` headers (DNS rebinding), and requires an `X-FlowForge` header on every write, so a web page can't create or trigger combos.
- **Shell injection:** the 🪄 Arcane Command card gets file names and other details as `FF_*` environment variables, never spliced into the command.
- **Data loss:** moves, copies and renames never overwrite an existing file.
- **Leaking secrets:** share codes leave out secret settings such as Discord webhook URLs.

Combos you build or import run with your own user's permissions, so only import share codes from people you trust.
