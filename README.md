# Bedrock Workshop v0.6.1-alpha

A zero-build, local-first Minecraft Bedrock world, inventory, and container editor designed for GitHub Pages.

**Live site:** `https://alastor-kaneki.github.io/Bedrock-World-Editor/`

## v0.6.1 - workshop refresh and tile helper recovery

v0.6.1 restores the missing Bedrock DB-key, concatenated tile-NBT, tile metadata, and container-size helpers used by the v0.6 controller. It also adds a focused Bedrock Workshop interface, parallel startup loading, keyboard-accessible controls and tabs, clearer local-processing guidance, responsive mobile actions, and a safer PWA cache strategy.

Unsaved command/sign/spawner/flower-pot card drafts now survive UI rerenders and block Save All or export until every highlighted card is explicitly saved, preventing the current controller from silently discarding those fields.

## v0.6.0 - verified LevelDB writeback

v0.6 replaces the unsafe orphan-WAL experiment that could produce a world which imported but failed when Minecraft tried to load it.

The architecture now follows the pattern learned from the uploaded **Inventory Editor for MCBE 2.6.1 (Astler)** package: `level.dat` remains the primary world file, while player/container data that actually lives in `db/` is handled as LevelDB records.

### Export pipeline

When DB-backed edits exist, the browser now:

1. commits all open UI edits with **Save All**;
2. serializes the edited `~local_player` and/or tile-entity records;
3. assigns new LevelDB sequence numbers;
4. builds a new **uncompressed Level-0 `.ldb` table** containing only the new versions of those records;
5. copies the active **MANIFEST history** and appends one VersionEdit that adds the new L0 table and advances the sequence/file counters;
6. updates `CURRENT` to the new manifest;
7. leaves the original `.ldb` / `.sst` files untouched;
8. rebuilds the complete `.mcworld`;
9. reopens that generated archive in-browser;
10. reopens its LevelDB view and verifies every edited record byte-for-byte before the download is allowed.

This is substantially safer than the old method of dropping a hand-made WAL into `db/`, but it is still alpha software. Keep the original world until the exported copy loads successfully in Minecraft.

## Current features

- Open complete `.mcworld` / ZIP worlds.
- Open Bedrock world folders.
- Open standalone `level.dat`.
- Parse/write Bedrock's 8-byte `level.dat` header and little-endian NBT.
- Edit world name, seed, game mode, difficulty, spawn, time, command state, Creative-loaded state, and detected gamerules.
- Browse/edit the full `level.dat` NBT tree.
- Recover supported `~local_player` records from Bedrock LevelDB.
- Edit player inventory, armor, offhand, **Ender Chest**, XP level, and health.
- Add/remove/edit enchantments, including custom numeric IDs and signed-short illegal levels.
- Browse a large item catalog including technical, hidden, Education, deprecated, and normally-unobtainable identifiers.
- Resolve vanilla sprites from Mojang's `bedrock-samples` metadata/assets when a matching texture exists.
- Preserve existing block-item `Block` metadata instead of inventing unknown block-state/version data.
- Scan LevelDB **tile-entity (`0x31`) records**.
- Browse/edit supported container `Items` lists: chests, barrels, hoppers, furnaces, smokers, brewing stands, dispensers, droppers, shulker boxes, crafters, and similar tile entities.
- Search containers by type or coordinates.
- Edit selected special tile fields: command block commands, sign text, mob-spawner entity identifiers, and flower-pot plant block names.
- Read/write multiple concatenated tile-entity NBT compounds in one DB value.
- Undo/redo, including DB-backed container snapshots.
- **Save All** before export.
- Export raw/selected player NBT.
- Export modified `level.dat`.
- Export a complete verified `.mcworld`.
- PWA/offline support.

## LevelDB engine coverage

`leveldb-adapter.js` currently implements the browser-side pieces needed for the editor's read and append-version workflow:

- physical WAL record parsing (`FULL`, `FIRST`, `MIDDLE`, `LAST`)
- CRC32C and LevelDB checksum masking
- WriteBatch parsing
- `CURRENT` / MANIFEST VersionEdit parsing
- live-table discovery
- LevelDB internal keys and sequence/type handling
- exact-key lookup
- full live-entry iteration across supported tables/WALs
- restart-array block parsing
- uncompressed data blocks
- Snappy decompression
- best-effort Bedrock compression types `2` and `4` using browser decompression streams
- new uncompressed Level-0 table generation
- MANIFEST-history-preserving VersionEdit append generation
- verified `CURRENT` rollover

### WebAssembly integrity core

`bedrock-db-core.wasm` is a small, real WebAssembly helper compiled from `wasm/bedrock_db_core.c`. It handles performance/safety-sensitive binary primitives used for Bedrock DB validation:

- CRC32C
- LevelDB checksum mask/unmask
- Bedrock x/z/dimension/type DB-key decoding
- packed LevelDB internal-key sequence/type tags

When the WASM helper loads successfully, the LevelDB reader/writer routes CRC32C mask/unmask work through it. Its key decoder is also self-tested alongside the scanner's equivalent JavaScript decoder. The LevelDB table/MANIFEST implementation itself is still JavaScript; this repository does **not** claim to contain a complete port of Mojang's native LevelDB implementation to WebAssembly yet.

## DB key support used by the container scanner

The current scanner recognizes the Bedrock chunk-key forms needed for tile entities:

- overworld-style: `x:int32 + z:int32 + type:u8`
- dimension-style: `x:int32 + z:int32 + dimension:int32 + type:u8`
- tile entity type: `0x31`

Unknown DB keys remain untouched.

## Safety properties

- Existing LevelDB tables are never modified in-place.
- Original manifests are retained in the archive.
- New DB writes get higher sequence numbers.
- The generated `.mcworld` is parsed again before download.
- `level.dat` must round-trip exactly.
- Every staged DB value must be visible from the exported DB and match exactly.
- The generated archive is checked with an internal reopen/readback pass. This is not a substitute for retaining the original and testing the edited copy in Minecraft.

## Still experimental / not yet supported

- automatic enumeration/editing of every remote `player_*` format
- full chunk/subchunk block editing
- actors/entities
- every special tile-entity UI (item frames and some less-common tile formats still need dedicated editors)
- full compaction / table rewriting
- every historical or preview Bedrock compression/storage variant
- a complete native Mojang LevelDB WebAssembly port

## Local tests

Serve the repository and open `tests/browser-smoke.html` in a current Chromium- or Firefox-based browser:

```bash
python3 -m http.server 8000
```

The v0.6.1 browser smoke test covers:

- NBT round-trip
- CRC32C known vector
- `~local_player` sequence supersession through a generated L0 table
- MANIFEST-history-preserving/CURRENT rollover
- Bedrock dimension/tile DB-key decoding
- concatenated named and unnamed tile-entity NBT
- container slot sizing
- player and tile-entity writeback through a generated L0 table
- complete MANIFEST-history preservation and `CURRENT` rollover
- a 100,000-byte LevelDB value
- the real WebAssembly CRC/key helper
- byte-for-byte complete `.mcworld` ZIP repacking
- full UI world loading, tile scanning, and multi-card draft retention
- required offline asset coverage and app-shell cache isolation

## GitHub Pages

Publish `main` from `/ (root)` under **Settings → Pages**. There is no build step and no server-side component.

## Project layout

- `index.html` - metadata and resilient loading shell
- `ui-0.6.1.js` - responsive UI bootstrap
- `enhancements.css` / `enhancements.js` - workshop design and accessibility layer
- `app-0.6.1.js` - current controller bootstrap
- `bedrock-helpers-0.6.1.js` - tile-key, NBT-sequence, and container helpers
- `item-data-0.4.0.js` — item/enchantment/catalog data layer
- `nbt.js` — little-endian Bedrock NBT
- `zip.js` — client-side ZIP reader/writer
- `leveldb-adapter.js` — browser LevelDB read/version-write engine
- `db-wasm.js` — WebAssembly bridge
- `bedrock-db-core.wasm` — compiled integrity/key helper
- `wasm/bedrock_db_core.c` — WASM source
- `service-worker-0.6.1.js` - current PWA worker
- `tests/browser-smoke.html` - browser regression suite

This is an unofficial Minecraft tool and is not affiliated with Mojang or Microsoft.
