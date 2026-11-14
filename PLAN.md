# Encounter Deck: Plan

Target: Foundry VTT v14 (14.360), dnd5e 5.3.2. GM-only. The table plays with physical miniatures on a map display.

Terms are defined in [CONTEXT.md](CONTEXT.md). Decisions that are hard to reverse are in [docs/adr/](docs/adr/).

## Principle

Reuse what Foundry and dnd5e already do (the combat tracker, actor sheets, compendium folders) instead of rebuilding it. Only build what's missing. Talk to optional modules such as Monk's TokenBar only when they're active, and never require them. Keep the world light.

## Prep

- **Storage:** a world compendium created by the module (ADR 0001). Each Encounter is a dnd5e Encounter actor (ADR 0003). Only the Active Campaign and the Shared Library load. Completed encounters load only when "Show completed" is on.
- **Campaigns:** a switcher in the header, remembered per world. Folders inside each Campaign.
- **Shared Library:** always visible. Using a Master Copy copies it into the Campaign.
- **Party:** each Campaign is linked to a Party Folder. Only the PCs directly inside it count. A Present toggle per PC.
- **Advancement Mode:** XP or Milestone, set per Campaign and defaulting to a world setting.
- **Encounter:** Creature Entries (an actor UUID plus a count), notes and tactics, tags, Status (Draft, Ready or Completed), and an optional link to a journal page or scene. Encounters can be duplicated.
- **Builder:** a collapsible drawer docked on the side of the Combat tab. Name search, then filters for CR range, type, size and habitat. Results have a + button and can be dragged, with quantity +/−. A live 2024 difficulty meter for present PCs.
- **Sources:** one checklist for the whole world, with every monster compendium on by default. It is dnd5e's own Compendium Browser source checklist (ADR 0003).
- **Missing monsters:** the row keeps its saved name and CR and is marked "missing". You can remove it or swap in another monster.

## Running a fight

- **Import** (ADR 0002): one click copies the monsters into a hidden Actors folder and places their tokens in the Margin of the scene you're viewing. It adds them and the present PCs (no tokens) to the combat tracker. You then press Foundry's own "Begin Combat".
- **Reinforcements:** you can import any encounter, including the same one again, any number of times into a running fight. Token numbering continues (Goblin 5, 6…).
- **Combat tab:** replaces the vanilla tab's UI but keeps Foundry's combat running underneath. It shows the browser when nothing is running, and the tracker plus AC, HP and a stat block button during a fight. The popped-out (floating) tracker gets the same browser and Encounters button, and the Builder docks on it while it's open.
- **Stat Blocks:** a monster's own sheet opens in one fixed spot beside the sidebar, replacing the last one. The tracker's book button and a double-click on a monster row open it, and Next/Previous Turn opens the current monster, skipping PCs. (A side strip of monster tabs was built and dropped: the tracker already does its job.)
- **Finish = Foundry's "End combat" confirmation.** In XP mode, every imported encounter's full XP is split between present PCs automatically and announced in a short public chat line, with no undo. Each encounter is marked Completed, then the imported tokens and actors are removed. An encounter that never reaches combat stays Ready.
- **Monk's TokenBar:** if its "Show XP dialog" setting is on, Encounter Deck asks once whether to turn it off, to avoid double XP.
- **Carousel (v0.3):** our own initiative strip across the top, replacing Carousel Combat Tracker. Square portrait cards in initiative order, the current one larger and named, the round on the left. Heroes (player characters, or anything a player owns) get a gold leaf-and-teardrop trim underneath, drawn larger than the card and cut to its width; monsters get none. Initiative in a gold-stroked corner box; statuses and conditions as plain icons down the left edge under it (a gold +N box opens the full list under the card), AC in gold in the top-right corner, with Foundry's own effect icons, following Foundry's own "show icon" rule. The GM gets Previous/Next Turn, all numbers, click to pan, double-click a monster for its Stat Block. Players and the table display see PC numbers only; a monster at half HP or less shows Bloodied as a pulsing red glow from the bottom of its card; hidden combatants are GM-only. A world setting picks the audience: Everyone (default), not the table display (Monk's Common Display's display user), or GM only. While Carousel Combat Tracker is active ours stays hidden, and the GM is asked once whether to turn it off. The look was chosen from a mockup and kept distinct from that module.
- **Music Deck** keeps working because it listens for `combatStart` and `deleteCombat` (`music-deck 2/module/src/combat.ts:261-262`).

## Roadmap

- **v0.1, prep:** storage, Campaigns, Shared Library, browser, Builder (Sources, filters, difficulty).
- **v0.2, running the fight:** Import, the enhanced tracker, Stat Blocks, Finish and XP.
- **v0.3, carousel:** our own carousel initiative tracker across the top. It shows portraits, the current turn, the round, PC HP, monster HP only as "bloodied", hidden enemy initiative, and Next/Previous turn for the GM. It gets a design pass, and it replaces the Carousel Combat Tracker module.
- **v0.4, integrations:** foundry-mcp tools.

## To verify during the build

- A player rolling initiative from their sheet or ve-mobile updates their token-less combatant. **Verified for the tracker (v0.2).** Foundry's `Actor#rollInitiative({createCombatants: true})` adds a new combatant for a token-less actor every time, so Encounter Deck blocks that duplicate on every client (`module/src/combatants.ts`). ve-mobile still to check.
- A PC's initiative entry works with no token on the scene. **Verified (v0.2).** ve-mobile rows already handle missing tokens (`ve-mobile/src/foundry/combat-gateway.mjs:388-412`).
