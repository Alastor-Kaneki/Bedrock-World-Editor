# Bedrock Web Editor v0.4.0-alpha

A zero-build, client-side Minecraft Bedrock world/inventory editor for GitHub Pages.

**Live site:** https://alastor-kaneki.github.io/Bedrock-World-Editor/

## v0.4.0 — Save All + verified export

This release fixes a major workflow bug where controls could contain edited values that had not yet been committed into the in-memory `level.dat` / player NBT when `.mcworld` export started.

- New **Save All** button in the top bar.
- Save All commits world settings, gamerules, player stats, and the currently-open item/enchantment editor in one action.
- **Export level.dat** and **Export .mcworld** automatically run Save All first.
- `.mcworld` export now reopens the generated archive before downloading it and checks that the rebuilt `level.dat` is byte-for-byte the edited one.
- If a `~local_player` LevelDB overlay is being exported, the editor checks that the player record round-trips through the generated world database.
- Export aborts with an error instead of downloading a world that fails those checks.
- v0.4.0 uses a new versioned loader/assets to avoid old PWA/service-worker files being mixed with the new editor.

## Current features

- Open complete `.mcworld` / ZIP world archives and Bedrock world folders.
- Treat `level.dat` as the primary world file.
- Edit world name, seed, game mode, difficulty, spawn, time, commands, Creative-loaded state, and detected gamerules.
- Browse/edit the full little-endian NBT tree.
- Edit local-player inventory, armor, offhand, XP level, and health when the player record is available.
- Browse Microsoft’s Bedrock item listing, including technical, hidden/normally-unobtainable, Education/chemistry, deprecated, and placeholder IDs.
- Resolve matching vanilla item/block sprites from Mojang’s official `bedrock-samples` assets.
- Add/remove enchantments, including custom numeric IDs and signed-short levels up to 32767.
- Experimental browser-side LevelDB reader plus local-player recovery-log export.
- Undo/redo.
- PWA/offline support.

## Important LevelDB note

`level.dat` is always written directly into the exported world. Modern player inventory can live in `db/`, so player changes use the experimental LevelDB path and receive an additional export-time round-trip check. Keep the original world until the edited copy has been tested in Minecraft.

## GitHub Pages

Publish `main` from `/ (root)` under **Settings → Pages**. No build step is required.

This is an unofficial Minecraft tool and is not affiliated with Mojang or Microsoft.
