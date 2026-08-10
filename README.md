# Bedrock Web Editor v0.3.1-alpha

A zero-build, client-side Minecraft Bedrock world/inventory editor designed for GitHub Pages.

**Live site:** https://alastor-kaneki.github.io/Bedrock-World-Editor/

v0.3.1 fixes stale GitHub Pages/PWA caching and makes the v0.3 item/enchantment UI part of the normal page shell, while keeping compatibility with users who still have the older shell cached.

## What it does

- Opens complete `.mcworld` / ZIP world archives and Bedrock world folders.
- Treats `level.dat` as the primary world file and preserves the rest of the world during export.
- Parses and writes Bedrock's 8-byte `level.dat` header and little-endian NBT.
- Edits world name, seed, game mode, difficulty, spawn, time, commands, Creative-loaded state, and detected gamerules.
- Browses and edits the full `level.dat` NBT tree.
- Detects embedded player records and can recover `~local_player` from supported LevelDB data.
- Edits main inventory, armor, offhand, XP level, and health.
- Browses the current Bedrock item listing from Microsoft's official Minecraft Creator reference.
- Includes technical, hidden/normally-unobtainable, Education/chemistry, deprecated, and placeholder IDs exposed by the reference.
- Resolves matching item/block sprites from Mojang's official `bedrock-samples` resource-pack metadata and raw assets.
- Falls back to a built-in catalog and glyph preview when an official source/texture cannot be reached.
- Adds/removes/updates item enchantments through Bedrock item NBT.
- Shows normal enchantment maximums as hints while allowing signed `TAG_Short` levels from `-32768` through `32767` and custom numeric enchantment IDs.
- Supports undo/redo.
- Exports edited `level.dat` or a rebuilt `.mcworld`.
- Works as a PWA on GitHub Pages.

## v0.3.1 cache/update fix

The previous service worker used a cache-first strategy for the entire app shell, which could make an already-opened or installed copy appear stuck on an older release. v0.3.1:

- bumps the cache namespace;
- uses versioned `app.js` / CSS URLs;
- forces service-worker update checks with `updateViaCache: "none"`;
- uses network-first loading for HTML, JavaScript, CSS, and the manifest;
- deletes previous Bedrock Web Editor caches on activation;
- refreshes controlled windows after the new worker activates.

## LevelDB support

`leveldb-adapter.js` currently implements:

- LevelDB physical WAL records (`FULL`, `FIRST`, `MIDDLE`, `LAST`)
- 32 KiB WAL block fragmentation
- CRC32C + LevelDB checksum masking
- WriteBatch parsing/writing with 64-bit sequence numbers
- `CURRENT` / `MANIFEST` parsing needed for live-file discovery
- exact user-key lookup in supported table blocks
- uncompressed blocks and raw Snappy decompression
- best-effort compression-type-2 handling through browser decompression APIs
- safe new-log overlay export for edited local-player data

The DB layer is secondary to `level.dat`; original SST tables are left untouched by the experimental player overlay writer.

## Still experimental / incomplete

- remote `player_*` selection
- arbitrary LevelDB key browsing
- chunk/subchunk block editing
- block entities and chest/container inventories
- actors/entities
- maps/structures/POI editing
- full SST creation/compaction
- broader historical Bedrock compression variants

Unsupported table compression is skipped with diagnostics rather than overwritten.

## GitHub Pages

This repository is intended to deploy directly from `main` at `/ (root)` with no build step.

## Local testing

```bash
python -m http.server 8080
node tests/selftest.mjs
```

## Safety

Keep an original copy of important worlds and test edited exports before replacing the original save.

This is an unofficial Minecraft tool and is not affiliated with Mojang or Microsoft.
