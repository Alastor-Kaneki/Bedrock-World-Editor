# Bedrock Web Editor v0.2.1-alpha

A zero-build, client-side Minecraft Bedrock world/inventory editor designed for GitHub Pages.

## v0.2.1 workflow correction

The editor is a **whole-world editor**, but `level.dat` is the primary file. When a `.mcworld`, ZIP, or world folder is opened, the app now treats the workflow in this order:

1. Find and parse `level.dat` first.
2. Open directly into the `level.dat` editor.
3. Apply world-setting and NBT edits to that in-memory `level.dat`.
4. Preserve every other file in the imported world.
5. Consult `db/` only for data that is not actually stored in `level.dat` (for example modern `~local_player`).
6. Rebuild the complete world with the edited `level.dat` as the primary changed file.

Standalone `level.dat` import/export remains supported for diagnostics, but the intended normal workflow is a complete Bedrock world.

The experimental browser-side LevelDB bridge from v0.2 remains available as a **secondary layer**, not the center of the editor.

## What works

- Open complete `.mcworld` and `.zip` world archives.
- Open complete Bedrock world folders.
- **Load `level.dat` first and use it as the primary editor/source.**
- Preserve the remaining world files and re-export the complete world.
- Open a standalone `level.dat` as a secondary diagnostic workflow.
- Parse/rewrite Bedrock's 8-byte `level.dat` header and little-endian NBT.
- All standard NBT tag types, including signed 64-bit `TAG_Long` through JavaScript `BigInt`.
- Edit world name, seed, game mode, difficulty, spawn, world time, commands, Creative-loaded state, and detected gamerules.
- Browse the complete `level.dat` NBT tree and edit scalar values.
- Detect player compounds embedded in `level.dat`.
- **Automatically recover and edit `~local_player` from LevelDB when its record is readable.**
- Main inventory, armor, offhand, XP level, and health editing.
- Clear the main inventory.
- Load/export raw little-endian player NBT.
- Bind a raw player NBT record to `~local_player` for the next world export.
- Inspect database status, manifest path, DB files, table warnings, and pending player DB edits.
- Undo/redo across `level.dat`, raw-player, and LevelDB-player edits.
- Export modified `level.dat` or a rebuilt `.mcworld`.
- Install as a PWA after GitHub Pages/HTTPS hosting.

## LevelDB engine coverage

`leveldb-adapter.js` is now a real engine rather than a placeholder. It implements:

- LevelDB physical WAL records (`FULL`, `FIRST`, `MIDDLE`, `LAST`)
- 32 KiB WAL block fragmentation
- CRC32C + LevelDB checksum masking
- WriteBatch parsing/writing with 64-bit sequence numbers
- `CURRENT` / `MANIFEST` VersionEdit parsing needed for live-file discovery
- Exact user-key lookup in table index/data blocks
- LevelDB internal-key sequence/type handling
- uncompressed blocks
- raw Snappy block decompression
- best-effort compression-type-2 decompression through browser `DecompressionStream` (`zstd`, `deflate`, or raw DEFLATE where available)
- safe new-log overlay export

### Why an overlay instead of rewriting SST files?

Rebuilding Mojang/Bedrock table files in-browser is much riskier than appending a valid recovery log. LevelDB recovery scans eligible/newer log files and replays their WriteBatches before opening the database. v0.2 uses that mechanism and leaves the original sorted tables untouched.

## Still not complete

This is **not yet a full Amulet/Universal Minecraft Tool-style world engine**. Remaining work includes:

- enumerating/selecting remote `player_*` records
- arbitrary LevelDB key browsing
- chunk/subchunk decoding and block editing
- block entities and chest/container inventories
- actors/entities
- maps/structures/POI data
- full SST creation/compaction
- broader handling of Bedrock-specific historical compression variants

If an SST block uses unsupported compression, the editor reports/skips it instead of overwriting it.

## GitHub Pages deployment

No build step is required.

1. Create a GitHub repository.
2. Copy this folder's contents to the repo root.
3. Commit/push.
4. Open **Settings → Pages**.
5. Choose **Deploy from a branch**.
6. Pick your default branch and `/ (root)`.

All application URLs are relative, so both of these layouts work:

- `https://USERNAME.github.io/`
- `https://USERNAME.github.io/REPOSITORY/`

## Local testing

Use HTTP rather than double-clicking `index.html` if you want PWA/service-worker behavior:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080/`.

Optional binary self-test (Node.js):

```bash
node tests/selftest.mjs
```

## Archive support

`zip.js` provides built-in ZIP32 import/export. It uses browser Compression Streams for DEFLATE and has no CDN/runtime dependency. ZIP64 is intentionally rejected instead of being written incorrectly.

## Safety

**Keep the original world.** LevelDB player writing is experimental. Test the exported copy in Minecraft before replacing anything important.

## Project layout

- `index.html` — responsive editor UI
- `styles.css` — dark red/purple responsive styling
- `app.js` — level.dat-first whole-world workflow, UI, secondary DB integration, export
- `nbt.js` — Bedrock little-endian NBT parser/writer
- `zip.js` — client-side ZIP reader/writer
- `leveldb-adapter.js` — browser LevelDB WAL/table reader + recovery-log writer
- `manifest.webmanifest` / `service-worker.js` — PWA support
- `icon.svg` — app icon
- `.nojekyll` — GitHub Pages/Jekyll bypass
- `test-fixtures/` — synthetic parser/editor fixtures
- `tests/selftest.mjs` — Node-based NBT/ZIP/LevelDB binary regression test

## Format references

Implementation decisions for LevelDB record/table/recovery behavior were checked against the current Mojang LevelDB source. Bedrock storage behavior was checked against Microsoft Minecraft Creator documentation.

This is an unofficial Minecraft tool and is not affiliated with Mojang or Microsoft.
