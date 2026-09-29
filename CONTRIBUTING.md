# Contributing to FlowForge

Thanks for helping! FlowForge is plain Node.js (20+) with **no dependencies**, so getting started is quick:

```bash
git clone https://github.com/Necromancervbh/Flowforge-.git
cd Flowforge-
npm start      # runs the app at http://localhost:4777
npm test       # node:test, runs in about 30 seconds
```

## Ideas and bugs

Open an issue using one of the templates: **Bug report**, **Card idea** or **Feature request**.

## Adding a card

A card is one object in `src/cards.js` plus a 64×64 SVG drawing in `public/art.js`.

- **WHEN** cards have `start({ params, fire, problem, helpers })` and return a `stop()` function.
- **IF** cards have `check(params, ctx)` and return `true` or `false`.
- **THEN** cards have `run(params, ctx, helpers)` and return a short summary for the Battle Log.

Give it a `rarity` and an `unlock` level, add a test in `test/engine.test.js`, and add a row to the card table in the README.

## Pull requests

- Keep the zero-dependency rule: use only Node's built-in modules.
- Run `npm test` before you push. CI runs it on Windows, macOS and Linux with Node 20 and 22.
- Never splice user text into a shell command; pass it as arguments or `FF_*` environment variables.
- Add a line to the "Unreleased" section of `CHANGELOG.md` for anything a player would notice.
