# Encounter Deck

A Foundry VTT v14 (dnd5e 5.3+) module for preparing encounters ahead of time, organized by campaign, without putting anything on a scene until you need it. GM-only.

Status: **v0.1 (prep)**. See [PLAN.md](PLAN.md) for the full spec and roadmap, [CONTEXT.md](CONTEXT.md) for the terms, and [docs/adr/](docs/adr/) for the decisions.

## What v0.1 does

- **Storage:** the first time a GM loads the world, the module creates a world compendium, *Encounter Deck*. Each Encounter is a dnd5e Encounter actor inside it (ADR 0001, ADR 0003). Campaigns and the Shared Library are its top-level folders.
- **Combat tab:** while no combat is viewed, the GM sees the encounter browser instead of the tracker. Foundry's combat keeps running underneath (`CONFIG.ui.combat` is subclassed, not replaced). During a combat the tracker shows, with an **Encounters** button to get back to the browser. Players always see the normal tracker.
- **Campaigns:** a switcher in the header (remembered per world), folders inside each Campaign, a Party Folder per Campaign with Present toggles, and an Advancement Mode (XP or Milestone, defaulting to a world setting).
- **Builder:** a collapsible drawer docked beside the Combat tab. Search the Sources by name, then filter by CR range, type, size and habitat. Add monsters with + or by dragging, change counts with +/−, and watch the live 2024 difficulty meter for the Present PCs.
- **Encounters:** tags, notes, tactics, Status (Draft, Ready, Completed; Completed hidden behind "Show completed"), duplicate, a link to a journal page or scene, copy-on-use from the Shared Library, and "missing" rows (with swap) for monsters whose Source is gone.
- **Sources:** dnd5e's own Compendium Browser source checklist, so there's one list for the whole world.

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
