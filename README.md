# Color Sort Puzzle

An Expo SDK 54 ball-sort puzzle game for Android, iOS, and the web.

## Project layout

- `artifacts/color-sort` — the game app
- `lib` — shared workspace packages used by the game

## Run locally

Install pnpm 10+, then from the repository root:

```bash
pnpm install
pnpm --filter @workspace/color-sort dev
```

The same command works in Replit and in a normal local checkout. Replit-specific
proxy settings are detected automatically; outside Replit, Expo uses its normal
LAN connection.

## Verify the game

```bash
pnpm --filter @workspace/color-sort typecheck
pnpm --filter @workspace/color-sort test -- --runInBand
```

The Expo app configuration is in `artifacts/color-sort/app.json`. The Android
application ID is `com.colorsort.puzzle`.