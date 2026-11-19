# Changelog

What each version of Encounter Deck added, newest first.

## v1.0.0

- **First public release.** Install it with the manifest URL in the README. Foundry's update check finds new versions through it.
- Same features as v0.10.

## v0.10

- **Drag PCs into a fight:** drop a player character (from the Actors tab, or a portrait in the browser's party row) onto the running fight's tracker. It joins on its token if it has one on the scene, token-less otherwise. A party member marked absent is marked present, so they share the XP at Finish. A companion a player owns joins the same way, not as a monster.
- **Tokens beside the map:** imported monsters now fill the Margin ring right next to the map first, instead of starting in the canvas's far top-left corner.
- **The table display stays put:** with Monk's Common Display following the combat (or the GM's controlled tokens), monster turns no longer pan the table display out into the Margin. The world setting "Table display follows tokens in the Margin" turns the old behaviour back on.
- **Completed folders:** each Campaign files its played Encounters in its own Completed folder, hidden unless "Show completed" is ticked. Finish, the row menu and the Builder all file them; marking one Ready or Draft again returns it to the folder it came from. Dragging an Encounter into the Completed folder completes it, and dragging it out makes it Ready. Encounters already Completed are filed when the world loads.

## v0.9

- **Legendary Menu:** the Legendary Prompt strip under the Carousel is gone. Instead, hover a legendary monster's pips (or its resistance shields) and a small window opens right under them, on top of any Stat Block: its legendary actions as one-click buttons (hover one for its description, as on the sheet), its legendary resistances left, and its recharge abilities, ready or spent. Move onto the window to use it; it closes when the mouse leaves.
- **Stat Block placement (v0.8.1):** the sheet's side tabs no longer cover the tracker.

## v0.8

- **Initiative for latecomers:** once a fight has started, monsters that join it (reinforcements, or monsters and Encounters dropped onto the tracker) roll initiative straight away. The rolls are GM-only, the newcomers slot into the order, and the current turn doesn't move. Before round 1 you roll as usual, and PCs always roll their own.

## v0.7

- **Distribute Loot:** when a fight ends, Monk's TokenBar's loot dialog still lists the defeated monsters' gear and coins (edit or remove anything), but its button is now **Distribute Loot**:
  - With **Mobile Deck** active and a **party inventory** (a dnd5e Group: the primary party, or a Group one of the Present PCs is in), everything goes into the Group.
  - Otherwise a short dialog lists each item with a dropdown of the **Present PCs** (pre-filled so they take turns). Coins are split evenly, and the leftover goes to whoever you pick.
  - Items stack onto ones the character (or Group) already has and arrive unequipped. One chat line says who got what.
- **Builder tab:** the Builder opens from a hammer tab at the bottom of the sidebar's tabs, shown with the Combat tab and lit while it's open. The popped-out tracker keeps the drawer's own handle.

## v0.6

- **The fight's Encounter:** a row at the top of the combat tracker (GM only) names the Encounter the fight started with, with every later Import listed as reinforcements, every monster added mid-fight as added, and the XP Finish will award. Click a name to open that Encounter in the Builder.
- **Add on the fly:** during a fight, drop a monster on the tracker (from the Builder's results, the Actors tab or a compendium). It gets a numbered token in the Margin and joins the combat, and it's saved into the fight's Encounter, so the Encounter records what was fought. Drop an Encounter from the browser (with the tracker popped out) to import it as reinforcements. The tracker shows a dashed gold outline while you drag over it.
- **Legendary resistance pips:** under a legendary monster's legendary action pips on the Carousel, small gold shields show its legendary resistances left (GM only).

## v0.5

- **Legendary pips:** a legendary monster's card in the Carousel shows its legendary actions left as gold pips under it, for the GM only.
- **Legendary Menu:** hover a legendary monster's pips on the Carousel and a small GM-only window opens under them, with its legendary actions as buttons, its legendary resistances left and its recharge abilities (ready or spent). A click uses the action through dnd5e, which spends the uses; actions that cost more than what's left are greyed out. dnd5e still gives the uses back after the monster's own turn.
- **Recharge:** during a monster's own turn, the Prompt also lists its recharge abilities as ready or spent ("Fire Breath 5–6"). Encounter Deck asks once whether to turn on dnd5e's Auto-recharge, which rolls them at the start of the monster's turn.
- **In its lair:** a checkbox on the Encounter (2024 lair rules). Import puts every monster with a lair inside it, on its own token, so it gets one more legendary action and legendary resistance. There's no Lair turn at initiative 20.

## v0.4

- **Sources dialog:** the Builder's Sources button opens Encounter Deck's own checklist with only the compendiums that hold monsters (no item, spell or hero packs, and empty ones hidden). They're grouped by the system, module or world they come from, with a switch for a whole group, and each shows its monster count, source book and rules version (2014 or 2024). It still saves to dnd5e's Compendium Browser checklist, so the two stay in step; "All compendiums…" opens dnd5e's full list.
- **Where a monster comes from:** every result shows a source tag such as "SRD 5.1 · 2014" or "SRD 5.2 · 2024" (or the monster's own book, like "Monster Manual 2024", when DDB Importer sets it), with the compendium's name on hover. A **Source** filter sits beside CR, Type, Size and Habitat.

## v0.3

- **Carousel:** the running fight across the top of the screen, for the whole table. Square portrait cards hang from the top edge in initiative order; the current one is larger and named, with the round on the left. Heroes (player characters and anything a player owns) get a slim gold trim underneath. Initiative sits in a gold-stroked box in the corner, and statuses and conditions show as plain icons down the left edge under it, with Foundry's own icons. When they don't fit, a gold "+N" box opens a list of all of them under the card. AC shows in gold in the top-right corner (heroes only, for players).
- **Who sees what:** the GM gets quiet Previous/Next Turn arrows beside the strip, every initiative and every HP bar; a click selects and pans to a token, a double-click on a monster opens its Stat Block. Players and the table display never see monster initiative or HP: a monster at half HP or less glows a pulsing red from the bottom of its card (**Bloodied**). Hidden combatants are GM-only.
- **Show the carousel to** (module setting): Everyone (default), GM and players but not the table display (the user Monk's Common Display shows the map on), or GM only. When the table display sees it, the carousel takes the place of Monk's popped-out tracker, which only shows the current turn.
- **Carousel Combat Tracker:** if it's active, Encounter Deck asks once whether to turn it off. Until it's off, our carousel stays hidden so there are never two.
- A long fight scrolls sideways (the mouse wheel works) and keeps the current card in view; Stat Blocks open below the carousel.

## v0.2

- **Import:** the ▶ button on an encounter row (on hover), its right-click menu, or the Builder. Compendium monsters are copied into a hidden *Encounter Deck: In Combat* Actors folder (world actors are used as they are), numbered tokens go into the Margin of the scene you're viewing, and they plus the Present PCs (without tokens) join the combat. Import again mid-fight for reinforcements; numbering continues (Goblin 5, 6…). A Master Copy is copied into the Active Campaign first. A scene with no padding is refused (ADR 0002).
- **Tracker:** AC (in gold) and HP on every row for the GM, with the visibility, defeated and ping buttons packed close. Type `-7` for damage, `+5` for healing or `12` for a new value, like dnd5e's token HUD.
- **Stat Blocks:** a monster's book button or a double-click on its tracker row opens its own dnd5e sheet in one fixed spot beside the sidebar (the book button again closes it). Next/Previous Turn opens the monster whose turn it is and leaves PC turns alone.
- **Finish:** Foundry's own "End combat". If the fight began, each imported Encounter is marked Completed and, in XP mode, the full XP is split between the Present PCs with one chat line. Every imported token and actor is removed either way.
- **Token-less PCs:** a player rolling initiative from the tracker or sheet updates their existing combatant instead of adding a second one.
- **Monk's TokenBar:** if its "Show XP Dialog" is on, Encounter Deck asks once whether to turn it off, so XP isn't awarded twice.

## v0.1

- **Storage:** the first time a GM loads the world, the module creates a world compendium, *Encounter Deck*. Each Encounter is a dnd5e Encounter actor inside it (ADR 0001, ADR 0003). Campaigns and the Shared Library are its top-level folders.
- **Combat tab:** while no combat is viewed, the GM sees the encounter browser instead of the tracker. Foundry's combat keeps running underneath (`CONFIG.ui.combat` is subclassed, not replaced). During a combat the tracker shows, with an **Encounters** button to get back to the browser. Players always see the normal tracker.
- **Campaigns:** a switcher in the header (remembered per world), folders inside each Campaign, a Party Folder per Campaign with Present toggles, and an Advancement Mode (XP or Milestone, defaulting to a world setting).
- **Builder:** a collapsible drawer docked beside the Combat tab. Open and close it with the hammer tab at the bottom of the sidebar's tabs (it shows while the Combat tab is open). Search the Sources by name, then filter by CR range, type, size, habitat and source. Add monsters with + or by dragging, change counts with +/−, and watch the live 2024 difficulty meter for the Present PCs. Drag an encounter from the browser onto the Builder to open it; if another encounter is open, you choose between adding its creatures and opening it instead. While the combat tracker is popped out, the Builder docks on that floating window instead of the sidebar, with its own handle.
- **Encounters:** tags, notes, tactics, Status (Draft, Ready, Completed; Completed hidden behind "Show completed"), duplicate, a link to a journal page or scene, copy-on-use from the Shared Library, and "missing" rows (with swap) for monsters whose Source is gone.
- **Sources:** dnd5e's own Compendium Browser source checklist, so there's one list for the whole world (shown in our own dialog since v0.4).
