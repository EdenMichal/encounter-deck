# Encounter Deck

A GM-only Foundry VTT tool for preparing encounters ahead of time, organized by campaign, without placing anything on a scene until it's needed.

## Organization

**Campaign**:
A named group of Encounters plus the party that will face them. Several Campaigns can exist in one world.
_Avoid_: Game, world, adventure

**Active Campaign**:
The one Campaign the GM is currently working in. Only its Encounters (and the Shared Library) are shown.
_Avoid_: Current campaign, selected campaign

**Shared Library**:
A set of reusable Encounters that is always shown, whichever Campaign is active.
_Avoid_: Global, common, templates folder

**Master Copy**:
An Encounter in the Shared Library. Using it in a Campaign makes an independent copy, and the Master Copy is never Completed.
_Avoid_: Template, prefab

## Party

**Party Folder**:
The folder in the Actors tab linked to a Campaign. Only the player characters directly inside it (not subfolders, not NPCs) make up the Campaign's party.
_Avoid_: Party, group

**Present**:
Whether a party member is at the table tonight. Absent members don't count toward difficulty.
_Avoid_: Active, attending

## Encounters

**Encounter**:
A prepared set of creatures with notes, optionally linked to a journal page or scene. It stays off every scene until the GM starts it.
_Avoid_: Fight, combat (in Foundry, "combat" means the combat tracker)

**Creature Entry**:
One line in an Encounter: a reference to an actor plus how many of it appear ("Goblin ×4").
_Avoid_: Token, combatant, monster

**Import**:
Bringing an Encounter's creatures into the world for a fight: their actors go into a hidden folder, their tokens go into the scene's margin, and they (plus the present PCs) join the combat tracker. It can be repeated during a fight for reinforcements, and it is undone at Finish.
_Avoid_: Deploy, spawn, stage

**Margin**:
The empty area of a scene outside the background image, where imported tokens sit so they never appear on the table display.
_Avoid_: Padding, off-map

**Stat Block**:
A monster's own dnd5e sheet, opened in one fixed spot beside the sidebar and replacing the previous one. The tracker's book button and a double-click on a monster row open it, and Next/Previous Turn opens the monster whose turn it is (skipping PCs).
_Avoid_: Follow turn, auto-open

**Carousel**:
The running fight across the top of the screen for the whole table: one card per combatant in initiative order, the current one larger. Players see monsters' Bloodied state, never their numbers.
_Avoid_: Dock, initiative bar, combat strip

**Hero**:
A player character, or anything a player owns. Heroes get the gold trim on the Carousel and players see their numbers.
_Avoid_: PC (fine in prose, but a companion is a Hero too), ally, party member

**Legendary Prompt**:
The GM-only strip under the Carousel that appears when a turn ends. It lists the legendary monsters that can still act, with their remaining uses and their legendary actions as buttons, plus the recharge abilities of the monster whose turn it is.
_Avoid_: Legendary reminder, legendary bar

**In its lair**:
An Encounter whose monsters fight inside their lair. Under the 2024 rules each one with a lair gets one more legendary action and legendary resistance; there is no Lair turn.
_Avoid_: Lair mode, lair action turn

**Builder**:
The screen for creating and editing Encounters: search and filter monsters, add them, and see the difficulty live.
_Avoid_: Creator, editor, suite

**Source**:
A compendium of monsters the GM has switched on as a place to search. The Builder only searches Sources, and labels each monster with where it comes from (its book and rules version, such as "SRD 5.1 · 2014").
_Avoid_: Pack, library

**Finish**:
What happens when the GM ends the fight with Foundry's own "End combat" confirmation. The Encounter is marked Completed. In XP mode, the whole Encounter's XP (defeated or not) is awarded to present PCs with no approval step. Then everything Import added is removed. An Encounter that never reaches combat earns no XP.
_Avoid_: End, close, complete

**Advancement Mode**:
Whether the party levels by **XP** or by **Milestone**. Under Milestone, Finish never awards XP, but XP values are still used for difficulty.
_Avoid_: Leveling type, XP setting

**Status**:
Where an Encounter stands: **Draft** (still being built), **Ready** (prepped to run) or **Completed** (already played; hidden and not loaded by default).
_Avoid_: Used, done
