# ⚒️ FlowForge

**A deckbuilder where every card is a real automation on your PC.**

Snap cards together into combos: a **WHEN** card (trigger), optional **IF** cards (filters) and **THEN** cards (actions). Every combo actually runs on your computer, sorting downloads, reminding you to take breaks, logging files, pinging Discord. Each successful run earns XP, levels up the combo and your player level, and unlocks rarer cards.

```
 📥 File Appears  →  🔎 Keyword "invoice"  →  🎩 Sorting Hat  ·  📜 Scribe
   (in Downloads)       (in the file name)     (to Invoices/2026)  (log it)
```

![FlowForge: card collection, forge, live combos and battle log](docs/screenshots/overview.png)

## Screenshots

| The Forge: snap cards into a combo | Collection: cards unlock as you level up |
|---|---|
| ![Editing the Invoice Catcher combo in the forge](docs/screenshots/forge.png) | ![Card collection with rarities and a locked epic card](docs/screenshots/collection.png) |

| Achievements | On a phone |
|---|---|
| ![Achievements dialog](docs/screenshots/achievements.png) | ![FlowForge on a narrow screen](docs/screenshots/mobile.png) |

## Run it

Needs [Node.js](https://nodejs.org) 20 or newer. There are no other dependencies.

```bash
git clone https://github.com/necromancervbh/flowforge-.git
cd flowforge-
npm start
```

Your browser opens at <http://localhost:4777>. Keep the terminal open: that's the engine running your combos. Progress is saved in `~/.flowforge/save.json`.

Options: `PORT=4778 npm start` uses another port, `FLOWFORGE_DATA=/some/dir` saves elsewhere, and `--no-open` skips opening the browser.

## Cards

| | Card | Rarity | Unlocks | What it does |
|---|---|---|---|---|
| **WHEN** | 🖐️ Hand Play | common | Lv 1 | Fires when you press ▶ Play |
| | 📥 File Appears | rare | Lv 1 | A new file lands in a folder (optionally only certain types) |
| | ⏱️ Ticking Clock | common | Lv 1 | Every N minutes |
| | 🌅 Daily Ritual | rare | Lv 2 | Once a day at a set time |
| | 🔌 Power On | common | Lv 3 | When FlowForge starts |
| | 🔭 Web Watcher | epic | Lv 4 | A web page's text changes |
| **IF** | 🔎 Keyword Filter | common | Lv 1 | Text contains / doesn't contain a word |
| | 🕘 Office Hours | common | Lv 2 | Only between two times |
| | 📅 Calendar Gate | common | Lv 2 | Only weekdays / weekends |
| | ⚖️ Heavy Load | rare | Lv 3 | File bigger / smaller than N MB |
| **THEN** | 🔔 Town Crier | common | Lv 1 | Desktop notification |
| | 🎩 Sorting Hat | rare | Lv 1 | Move the file to a folder |
| | 📜 Scribe | common | Lv 1 | Append a line to a text file |
| | 🌀 Portal | common | Lv 2 | Open a website |
| | 📂 Summon | common | Lv 2 | Open a file, folder or app |
| | 🪞 Mirror Image | rare | Lv 3 | Copy the file to a folder |
| | 🏷️ True Name | rare | Lv 3 | Rename the file |
| | 🐦‍⬛ Raven | epic | Lv 4 | Post to a Discord webhook |
| | 🪄 Arcane Command | legendary | Lv 5 | Run a shell command |

### Magic words

Any text box can use placeholders that are filled in when the combo runs:
`{{file.name}}`, `{{file.base}}`, `{{file.ext}}`, `{{file.path}}`, `{{file.dir}}`, `{{date}}`, `{{time}}`, `{{datetime}}`, `{{year}}`, `{{month}}`, `{{day}}`, `{{weekday}}`, `{{combo.name}}`, `{{page.url}}`, `{{page.title}}`, `{{page.snippet}}`.

Example: move to `~/Documents/Sorted/{{year}}/{{file.ext}}`.

The **Arcane Command** card is the exception: it gets these as environment variables (`$FF_FILE_PATH`, `$FF_FILE_NAME`, `$FF_FILE_EXT`, `$FF_COMBO`, `$FF_PAGE_URL`; use `%FF_FILE_PATH%` on Windows) so a strangely named file can't inject shell commands.

## Progression

- Each successful run gives **10 XP + 5 XP per action**, and adds the manual time each action saves to your ⏳ counter.
- The player levels up at 100 / 400 / 900 / 1600 XP, and each level unlocks new cards.
- Combos level up separately (★) the more they run.
- There are 9 achievements, from *First Forge* to *Perpetual Motion*, each with bonus XP.

## Safety

- The engine only listens on `127.0.0.1`. It rejects requests with a foreign `Host` header (DNS rebinding) and any write without the `X-FlowForge` header, so websites you visit can't create or trigger combos.
- Moves, copies and renames never overwrite: `report.pdf` becomes `report (1).pdf`.
- Files FlowForge writes into a watched folder don't re-trigger that folder's combos, so there are no infinite loops.

## Develop

```bash
npm test     # node:test, no dependencies
```

```
src/cards.js     card catalog: stats + real implementations
src/engine.js    arms triggers, runs combos, awards XP
src/game.js      levels and achievements
src/platform.js  notifications / open / shell per OS
src/store.js     atomic JSON save file
src/server.js    localhost API + static UI
public/          the card-game UI (vanilla JS)
```

Adding a card is one object in `src/cards.js`.
