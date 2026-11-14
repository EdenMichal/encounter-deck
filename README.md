# Encounter Deck

A Foundry VTT v14 (dnd5e 5.3+) module for preparing encounters ahead of time, organized by campaign, without putting anything on a scene until you need it. Prep is GM-only; the carousel is for the whole table.

Status: **v0.5 (legendary)**. See [PLAN.md](PLAN.md) for the full spec and roadmap, [CONTEXT.md](CONTEXT.md) for the terms, and [docs/adr/](docs/adr/) for the decisions.

## What v0.1 does

- **Storage:** the first time a GM loads the world, the module creates a world compendium, *Encounter Deck*. Each Encounter is a dnd5e Encounter actor inside it (ADR 0001, ADR 0003). Campaigns and the Shared Library are its top-level folders.
- **Combat tab:** while no combat is viewed, the GM sees the encounter browser instead of the tracker. Foundry's combat keeps running underneath (`CONFIG.ui.combat` is subclassed, not replaced). During a combat the tracker shows, with an **Encounters** button to get back to the browser. Players always see the normal tracker.
- **Campaigns:** a switcher in the header (remembered per world), folders inside each Campaign, a Party Folder per Campaign with Present toggles, and an Advancement Mode (XP or Milestone, defaulting to a world setting).
- **Builder:** a collapsible drawer docked beside the Combat tab. Search the Sources by name, then filter by CR range, type, size, habitat and source. Add monsters with + or by dragging, change counts with +/−, and watch the live 2024 difficulty meter for the Present PCs. Drag an encounter from the browser onto the Builder to open it; if another encounter is open, you choose between adding its creatures and opening it instead. While the combat tracker is popped out, the Builder docks on that floating window instead of the sidebar.
- **Encounters:** tags, notes, tactics, Status (Draft, Ready, Completed; Completed hidden behind "Show completed"), duplicate, a link to a journal page or scene, copy-on-use from the Shared Library, and "missing" rows (with swap) for monsters whose Source is gone.
- **Sources:** dnd5e's own Compendium Browser source checklist, so there's one list for the whole world (shown in our own dialog since v0.4).

## What v0.2 adds

- **Import:** the ▶ button on an encounter row (on hover), its right-click menu, or the Builder. Compendium monsters are copied into a hidden *Encounter Deck: In Combat* Actors folder (world actors are used as they are), numbered tokens go into the Margin of the scene you're viewing, and they plus the Present PCs (without tokens) join the combat. Import again mid-fight for reinforcements; numbering continues (Goblin 5, 6…). A Master Copy is copied into the Active Campaign first. A scene with no padding is refused (ADR 0002).
- **Tracker:** AC (in gold) and HP on every row for the GM, with the visibility, defeated and ping buttons packed close. Type `-7` for damage, `+5` for healing or `12` for a new value, like dnd5e's token HUD.
- **Stat Blocks:** a monster's book button or a double-click on its tracker row opens its own dnd5e sheet in one fixed spot beside the sidebar (the book button again closes it). Next/Previous Turn opens the monster whose turn it is and leaves PC turns alone.
- **Finish:** Foundry's own "End combat". If the fight began, each imported Encounter is marked Completed and, in XP mode, the full XP is split between the Present PCs with one chat line. Every imported token and actor is removed either way.
- **Token-less PCs:** a player rolling initiative from the tracker or sheet updates their existing combatant instead of adding a second one.
- **Monk's TokenBar:** if its "Show XP Dialog" is on, Encounter Deck asks once whether to turn it off, so XP isn't awarded twice.

## What v0.3 adds

- **Carousel:** the running fight across the top of the screen, for the whole table. Square portrait cards hang from the top edge in initiative order; the current one is larger and named, with the round on the left. Heroes (player characters and anything a player owns) get a slim gold trim underneath. Initiative sits in a gold-stroked box in the corner, and statuses and conditions show as plain icons down the left edge under it, with Foundry's own icons. When they don't fit, a gold "+N" box opens a list of all of them under the card. AC shows in gold in the top-right corner (heroes only, for players).
- **Who sees what:** the GM gets quiet Previous/Next Turn arrows beside the strip, every initiative and every HP bar; a click selects and pans to a token, a double-click on a monster opens its Stat Block. Players and the table display never see monster initiative or HP: a monster at half HP or less glows a pulsing red from the bottom of its card (**Bloodied**). Hidden combatants are GM-only.
- **Show the carousel to** (module setting): Everyone (default), GM and players but not the table display (the user Monk's Common Display shows the map on), or GM only.
- **Carousel Combat Tracker:** if it's active, Encounter Deck asks once whether to turn it off. Until it's off, our carousel stays hidden so there are never two.
- A long fight scrolls sideways (the mouse wheel works) and keeps the current card in view; Stat Blocks open below the carousel.

## What v0.4 adds

- **Sources dialog:** the Builder's Sources button opens Encounter Deck's own checklist with only the compendiums that hold monsters (no item, spell or hero packs, and empty ones hidden). They're grouped by the system, module or world they come from, with a switch for a whole group, and each shows its monster count, source book and rules version (2014 or 2024). It still saves to dnd5e's Compendium Browser checklist, so the two stay in step; "All compendiums…" opens dnd5e's full list.
- **Where a monster comes from:** every result shows a source tag such as "SRD 5.1 · 2014" or "SRD 5.2 · 2024" (or the monster's own book, like "Monster Manual 2024", when DDB Importer sets it), with the compendium's name on hover. A **Source** filter sits beside CR, Type, Size and Habitat.

## What v0.5 adds

- **Legendary pips:** a legendary monster's card in the Carousel shows its legendary actions left as gold pips under it, for the GM only.
- **Legendary Prompt:** when a turn ends, a GM-only strip under the Carousel lists every legendary monster that didn't just act, with its pips and its legendary actions as buttons. A click uses the action through dnd5e, which spends the uses; actions that cost more than what's left are greyed out. Close it with ✕; it clears at the next turn anyway. dnd5e still gives the uses back after the monster's own turn.
- **Recharge:** during a monster's own turn, the Prompt also lists its recharge abilities as ready or spent ("Fire Breath 5–6"). Encounter Deck asks once whether to turn on dnd5e's Auto-recharge, which rolls them at the start of the monster's turn.
- **In its lair:** a checkbox on the Encounter (2024 lair rules). Import puts every monster with a lair inside it, on its own token, so it gets one more legendary action and legendary resistance. There's no Lair turn at initiative 20.

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
