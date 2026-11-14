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
- **Sources:** one checklist for the whole world, with every monster compendium on by default. It is dnd5e's own Compendium Browser source checklist (ADR 0003), edited in our own Sources dialog (v0.4) that shows only compendiums holding monsters, grouped by the system, module or world they come from, with each one's monster count, source book and rules version. Each Builder result carries a source tag ("SRD 5.1 · 2014", "SRD 5.2 · 2024", or the monster's own book when DDB Importer sets one) and a Source filter sits beside the others, so two Goblins are easy to tell apart. "All compendiums…" still opens dnd5e's full checklist.
- **Missing monsters:** the row keeps its saved name and CR and is marked "missing". You can remove it or swap in another monster.

## Running a fight

- **Import** (ADR 0002): one click copies the monsters into a hidden Actors folder and places their tokens in the Margin of the scene you're viewing. It adds them and the present PCs (no tokens) to the combat tracker. You then press Foundry's own "Begin Combat".
- **Reinforcements:** you can import any encounter, including the same one again, any number of times into a running fight. Token numbering continues (Goblin 5, 6…).
- **The fight's Encounter (v0.6):** a GM-only row at the top of the tracker names the Encounter the fight started with (click to open it in the Builder), every later Import as "reinforcements", every monster added on the fly as "added", and the XP Finish will award.
- **Add on the fly (v0.6):** during a fight the tracker takes drops. A monster (from the Builder's results, the Actors tab or a compendium) gets a numbered token in the Margin and a combatant, and is saved into the fight's Encounter as a Creature Entry, so the Encounter records what was actually fought; its XP counts at Finish. An Encounter dragged from the browser (with the tracker popped out) is imported as reinforcements.
- **Combat tab:** replaces the vanilla tab's UI but keeps Foundry's combat running underneath. It shows the browser when nothing is running, and the tracker plus AC, HP and a stat block button during a fight. The popped-out (floating) tracker gets the same browser and Encounters button, and the Builder docks on it while it's open.
- **Stat Blocks:** a monster's own sheet opens in one fixed spot beside the sidebar, replacing the last one. The tracker's book button and a double-click on a monster row open it, and Next/Previous Turn opens the current monster, skipping PCs. (A side strip of monster tabs was built and dropped: the tracker already does its job.)
- **Finish = Foundry's "End combat" confirmation.** In XP mode, every imported encounter's full XP is split between present PCs automatically and announced in a short public chat line, with no undo. Each encounter is marked Completed, then the imported tokens and actors are removed. An encounter that never reaches combat stays Ready.
- **Monk's TokenBar:** if its "Show XP dialog" setting is on, Encounter Deck asks once whether to turn it off, to avoid double XP.
- **Carousel (v0.3):** our own initiative strip across the top, replacing Carousel Combat Tracker. Square portrait cards in initiative order, the current one larger and named, the round on the left. Heroes (player characters, or anything a player owns) get a gold leaf-and-teardrop trim underneath, drawn larger than the card and cut to its width; monsters get none. Initiative in a gold-stroked corner box; statuses and conditions as plain icons down the left edge under it (a gold +N box opens the full list under the card), AC in gold in the top-right corner, with Foundry's own effect icons, following Foundry's own "show icon" rule. The GM gets Previous/Next Turn, all numbers, click to pan, double-click a monster for its Stat Block. Players and the table display see PC numbers only; a monster at half HP or less shows Bloodied as a pulsing red glow from the bottom of its card; hidden combatants are GM-only. A world setting picks the audience: Everyone (default), not the table display (Monk's Common Display's display user), or GM only. While Carousel Combat Tracker is active ours stays hidden, and the GM is asked once whether to turn it off. The look was chosen from a mockup and kept distinct from that module.
- **Legendary actions, recharge and lairs (v0.5, plan and decisions in [docs/plans/v0.5-legendary-and-lair.md](docs/plans/v0.5-legendary-and-lair.md)):** a legendary monster's Carousel card shows its legendary uses left as gold pips, with its legendary resistances as small gold shields under them (v0.6), for the GM only. When a turn ends, a GM-only **Legendary Prompt** under the Carousel lists every legendary monster that didn't just act. Each row has its pips and its legendary actions as buttons (cost shown, too-costly ones disabled), which use them through dnd5e in one click, skipping its "Consume Legendary Action?" dialog. Spells a feature casts (dnd5e's cached spells) are left out, as on the sheet. A Stat Block that would cover the Prompt moves down below it. During a monster's own turn the Prompt also shows its recharge abilities as ready or spent. dnd5e rolls recharge itself once its "auto-recharge" setting is on, and Encounter Deck asks once to turn it on. Lairs follow the 2024 rules: an Encounter's **In its lair** checkbox makes Import mark its monsters as inside their lair, which gives them +1 legendary action and resistance, with no Lair turn at initiative 20.
- **Music Deck** keeps working because it listens for `combatStart` and `deleteCombat` (`music-deck 2/module/src/combat.ts:261-262`).

## Roadmap

- **v0.1, prep:** storage, Campaigns, Shared Library, browser, Builder (Sources, filters, difficulty).
- **v0.2, running the fight:** Import, the enhanced tracker, Stat Blocks, Finish and XP.
- **v0.3, carousel:** our own carousel initiative tracker across the top. It shows portraits, the current turn, the round, PC HP, monster HP only as "bloodied", hidden enemy initiative, and Next/Previous turn for the GM. It gets a design pass, and it replaces the Carousel Combat Tracker module.
- **v0.4, Sources:** our own Sources dialog with only monster compendiums, source tags on results and a Source filter.
- **v0.5, legendary:** legendary pips on the Carousel, the Legendary Prompt, recharge reminders, and In its lair (2024 lair rules).
- **v0.6, on the fly:** the fight's Encounter row in the tracker, dropping monsters and Encounters onto the tracker, and legendary resistance pips.

## To verify during the build

- A player rolling initiative from their sheet or Mobile Deck updates their token-less combatant. **Verified (v0.2 tracker, v0.4 Mobile Deck).** Foundry's `Actor#rollInitiative({createCombatants: true})` adds a new combatant for a token-less actor every time, so Encounter Deck blocks that duplicate on every client (`module/src/combatants.ts`). Mobile Deck (which replaced ve-mobile) calls `actor.rollInitiative()` from its character screen and `combat.rollInitiative([id])` from its combat view, neither of which creates a combatant; both were checked live in test-5e-world and land on the existing one.
- A PC's initiative entry works with no token on the scene. **Verified (v0.2).** Mobile Deck rows already handle missing tokens (`mobile-deck/src/foundry/combat-gateway.mjs:388-412`).
