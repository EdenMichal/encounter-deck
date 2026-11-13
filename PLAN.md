# Encounter Deck: Plan (draft)

Target: Foundry VTT v14, dnd5e system. GM-only.

## Decided

- **Campaigns.** A campaign switcher in the header. Only the active campaign loads. The choice is remembered per world.
- **Campaign party.** Each campaign is linked to a folder in the Actors tab. The module reads the PCs in that folder (how many, and their levels) to work out difficulty.
- **Difficulty** uses the 2024 rules.
- **Shared library.** Always visible next to the active campaign. Holds reusable fights.
- **Folders** inside each campaign (for example Act 1, Act 2, Random, Bosses).
- **Completed checkbox** on each encounter. Completed encounters are not loaded by default.
- **Actors are stored as references** (UUID plus a count), never copies. Dragging the same actor twice raises its count ("Goblin ×4").
- **Keep the world light.** Encounter data must not clutter or weigh down the world.

## Roadmap

- **v0.1, core:** campaigns, folders, drag actors in from the sidebar or compendiums, quick-add search, notes and tactics, duplicate, status, completed checkbox, Shared library.
- **v0.2, running the fight:** deploy as a group of tokens, Start Combat, link an encounter to a scene.
- **v0.3, prep help:** live difficulty meter, rewards, generate an encounter from a random table.
- **v0.4, integrations:** foundry-mcp tools, music-deck cues.

## Open questions (to grill)

- How storage works, given "keep the world light."
- More questions will be added as they come up.
