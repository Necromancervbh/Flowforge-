# Changelog

## Unreleased

- 🖱️ **Double-click launchers**: `FlowForge.bat` (Windows), `FlowForge.command` (macOS), `flowforge.sh` (Linux); they check for Node.js 20+ and open nodejs.org if it's missing
- 📦 Each published release gets a ready-to-run `FlowForge-<version>.zip` attached automatically
- ⏳ **Hourglass** action card (level 2): wait N seconds (max 300) before the next card
- 📅 **Calendar Gate** can now pick specific days, e.g. `mon, wed, fri` (typos are reported instead of silently never matching)
- 🃏 **Card Collector** (10 different cards, +100 XP) and 👑 **Grand Collector** (20, +250 XP) achievements

## 1.0.0 (2026-09-28)

The first full release: a deckbuilder where every card is a real automation on your PC.

### Cards (24)
- **WHEN:** Hand Play, File Appears, 📋 Copycat (clipboard), ✏️ Tripwire (file edited), Ticking Clock, Daily Ritual, Power On, Web Watcher
- **IF:** Keyword Filter, 🧩 Type Gate, Office Hours, Calendar Gate, Heavy Load
- **THEN:** Town Crier, Sorting Hat, Scribe, 📎 Echo (copy to clipboard), Portal, Summon, Mirror Image, 🗜️ Compactor (gzip), True Name, Raven (Discord), Arcane Command
- Every card has its own hand-drawn SVG illustration; epic cards glow and legendary cards shimmer

### Game
- XP, player levels that unlock rarer cards, combo levels (★)
- 11 achievements, including 🔥 *Warming Up* and 🌋 *On Fire* for daily streaks
- 🔥 Daily streak counter in the header

### Building combos
- Drag-and-drop forge with magic words like `{{file.name}}`, `{{year}}`, `{{clip.text}}`
- Starter recipes (Downloads Sorter, Invoice Catcher, Screenshot Stash, Stretch Break, Link Collector); recipes above your level show 🔒
- 🔍 Card search (press `/`)
- ⧉ Copy a combo, 📤 share it as an `FF1-…` code, 📥 import a friend's code (secrets are stripped)
- 🧪 ▶ Play a file combo on a test file

### Running combos
- 📜 Last 5 runs on every combo (done, held back or failed)
- ⏸ Pause all / ▶ Resume all
- 💾 Save the Battle Log as a text file
- Loop guards: FlowForge ignores its own file writes and clipboard copies

### App
- ☀️ / 🌙 light and dark themes, remembered between visits
- Command-line options: `--port`, `--data`, `--no-open`, `--help`, `--version`
- Localhost-only API with Host and custom-header checks
- Zero dependencies; tested on Windows, macOS and Linux (Node 20 and 22) in CI
