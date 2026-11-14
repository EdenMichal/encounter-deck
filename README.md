# Encounter Deck

A Foundry VTT v14 (dnd5e 5.3+) module for preparing encounters ahead of time, organized by campaign, without putting anything on a scene until you need it. GM-only.

Status: **v0.2 (running the fight)**. See [PLAN.md](PLAN.md) for the full spec and roadmap, [CONTEXT.md](CONTEXT.md) for the terms, and [docs/adr/](docs/adr/) for the decisions.

## What v0.1 does

- **Storage:** the first time a GM loads the world, the module creates a world compendium, *Encounter Deck*. Each Encounter is a dnd5e Encounter actor inside it (ADR 0001, ADR 0003). Campaigns and the Shared Library are its top-level folders.
- **Combat tab:** while no combat is viewed, the GM sees the encounter browser instead of the tracker. Foundry's combat keeps running underneath (`CONFIG.ui.combat` is subclassed, not replaced). During a combat the tracker shows, with an **Encounters** button to get back to the browser. Players always see the normal tracker.
- **Campaigns:** a switcher in the header (remembered per world), folders inside each Campaign, a Party Folder per Campaign with Present toggles, and an Advancement Mode (XP or Milestone, defaulting to a world setting).
- **Builder:** a collapsible drawer docked beside the Combat tab. Search the Sources by name, then filter by CR range, type, size and habitat. Add monsters with + or by dragging, change counts with +/−, and watch the live 2024 difficulty meter for the Present PCs. Drag an encounter from the browser onto the Builder to open it; if another encounter is open, you choose between adding its creatures and opening it instead. While the combat tracker is popped out, the Builder docks on that floating window instead of the sidebar.
- **Encounters:** tags, notes, tactics, Status (Draft, Ready, Completed; Completed hidden behind "Show completed"), duplicate, a link to a journal page or scene, copy-on-use from the Shared Library, and "missing" rows (with swap) for monsters whose Source is gone.
- **Sources:** dnd5e's own Compendium Browser source checklist, so there's one list for the whole world.

## What v0.2 adds

- **Import:** the ▶ button on an encounter row (on hover), its right-click menu, or the Builder. Compendium monsters are copied into a hidden *Encounter Deck: In Combat* Actors folder (world actors are used as they are), numbered tokens go into the Margin of the scene you're viewing, and they plus the Present PCs (without tokens) join the combat. Import again mid-fight for reinforcements; numbering continues (Goblin 5, 6…). A Master Copy is copied into the Active Campaign first. A scene with no padding is refused (ADR 0002).
- **Tracker:** AC and HP on every row for the GM. Type `-7` for damage, `+5` for healing or `12` for a new value, like dnd5e's token HUD.
- **Stat Blocks:** a monster's book button or a double-click on its tracker row opens its own dnd5e sheet in one fixed spot beside the sidebar (the book button again closes it). Next/Previous Turn opens the monster whose turn it is and leaves PC turns alone.
- **Finish:** Foundry's own "End combat". If the fight began, each imported Encounter is marked Completed and, in XP mode, the full XP is split between the Present PCs with one chat line. Every imported token and actor is removed either way.
- **Token-less PCs:** a player rolling initiative from the tracker or sheet updates their existing combatant instead of adding a second one.
- **Monk's TokenBar:** if its "Show XP Dialog" is on, Encounter Deck asks once whether to turn it off, so XP isn't awarded twice.

## Develop

```bash
npm install
npm run build      # module/dist/main.js
npm test           # vitest
npm run typecheck
```

Install by symlinking `module/` into the Foundry data folder:

```bash
ln -s "$PWD/module" $FOUNDRY_DATA/Data/modules/encounter-deck
```

Foundry only discovers a new module when a world is launched from Setup, so relaunch the world once, then enable Encounter Deck in Manage Modules.
