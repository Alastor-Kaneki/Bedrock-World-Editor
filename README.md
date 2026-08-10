# Bedrock Web Editor v0.3.2-alpha

A zero-build, client-side Minecraft Bedrock world/inventory editor designed for GitHub Pages.

**Live site:** https://alastor-kaneki.github.io/Bedrock-World-Editor/

## v0.3.2 Firefox/cache recovery

v0.3.2 fixes the startup failure shown in Firefox where an older cached v0.3 bootstrap could be mixed with the newer HTML shell and crash on a missing `.onchange` target.

The recovery release now:

- uses a release-specific bootstrap file (`boot-0.3.2.js`);
- deletes old `bedrock-web-editor-*` Cache Storage entries before loading the controller;
- unregisters stale service workers for the site scope;
- imports the current controller with a unique cache-busting URL;
- installs a new network-first `service-worker-0.3.2.js`;
- keeps the full v0.3 item/enchantment UI directly in `index.html`;
- keeps the live-site link in the website's About tab.

## Current features

- Open complete `.mcworld` / ZIP world archives and Bedrock world folders.
- Treat `level.dat` as the primary world file and preserve the rest of the world during export.
- Parse and write Bedrock's 8-byte `level.dat` header and little-endian NBT.
- Edit world name, seed, game mode, difficulty, spawn, time, commands, Creative-loaded state, and detected gamerules.
- Browse and edit the full `level.dat` NBT tree.
- Detect embedded player data and recover supported `~local_player` LevelDB records.
- Edit main inventory, armor, offhand, XP level, and health.
- Browse Microsoft's current Bedrock item listing, including technical, hidden/normally-unobtainable, Education/chemistry, deprecated, and placeholder IDs.
- Resolve matching item/block sprites from Mojang's official `bedrock-samples` resource-pack metadata and raw assets.
- Fall back to a built-in catalog/glyph when a remote source or sprite is unavailable.
- Add, remove, and update enchantments in item NBT.
- Show normal enchantment maximums as hints while allowing signed `TAG_Short` levels from `-32768` through `32767` and custom numeric enchantment IDs.
- Undo/redo.
- Export modified `level.dat` or a rebuilt `.mcworld`.
- PWA/GitHub Pages support.

## LevelDB coverage

The experimental browser-side LevelDB bridge supports WAL recovery, WriteBatch parsing/writing, CRC32C, exact-key lookup in supported table blocks, raw Snappy decompression, and safe recovery-log overlays for edited `~local_player` data.

It intentionally does **not** yet provide a complete chunk/block/entity editor. Planned areas include remote `player_*` selection, arbitrary key browsing, chunk/subchunk decoding, block entities/containers, actors/entities, maps/structures/POI, and broader Bedrock compression support.

## GitHub Pages

This repository is deployed from `main` at `/` with no build step.

Live URL:

`https://alastor-kaneki.github.io/Bedrock-World-Editor/`

## Safety

Keep the original world until an edited copy has loaded successfully in Minecraft. LevelDB editing remains experimental.

This is an unofficial Minecraft tool and is not affiliated with Mojang or Microsoft.
