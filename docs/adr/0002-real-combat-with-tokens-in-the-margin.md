# Run fights as real Foundry combat, with tokens hidden in the scene margin

The table plays with miniatures, so no tokens are needed on the map. Even so, Import places real tokens in the scene's Margin (outside the background image) and imports compendium monsters into a hidden Actors folder for the length of the fight. Finish removes both. We chose this because Foundry's own tracker, dnd5e sheets, ve-mobile and Music Deck all expect a real combat. A combatant without a token falls back to the world actor (`client/documents/combatant.mjs:92-95`), so copies of the same monster would share one HP pool, and a token can't exist without a world actor (`client/documents/token.mjs:253-266`).

## Considered Options

- **Module-only tracker (no Foundry combat).** Rejected: players lose the turn order on ve-mobile, and the module would rebuild what vanilla already does.
- **Hybrid** (the module tracks monster HP, while a Foundry combat holds only nameplates). Rejected: more custom code. It also depends on rolling from in-memory actors, which breaks dnd5e chat card buttons.
- **No world actors at all.** Rejected: a token can't exist without one. Making them temporary (removed at Finish) keeps the world light.
