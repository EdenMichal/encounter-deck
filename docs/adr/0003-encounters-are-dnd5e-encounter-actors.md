# Encounters are dnd5e Encounter actors

The module's world compendium (ADR 0001) is an Actor compendium, and each Encounter is a dnd5e actor of type `encounter`. dnd5e 5.3.2 already models exactly what a Creature Entry is: `system.members` holds an actor UUID plus a quantity. Everything dnd5e doesn't have (Status, tags, notes, tactics, the optional link, and the saved name, CR and XP of each Creature Entry so a "missing" row can still show them) lives in `flags.encounter-deck`.

Campaigns, their subfolders and the Shared Library are Actor folders inside that compendium. A Campaign folder's flags hold its Party Folder, its Advancement Mode and which party members are absent.

The Builder's Sources reuse dnd5e's world-wide Compendium Browser source checklist (the `dnd5e.packSourceConfiguration` setting, where every pack is on unless switched off), so there is one checklist for the whole world. Since v0.4 the Builder edits it through its own Sources dialog, which shows only the compendiums that hold monsters; dnd5e's full checklist is one click away.

## Considered Options

- **JournalEntry documents with everything in flags.** Rejected: it reuses nothing, and dnd5e's encounter sheet, member lookup and XP total would have to be rebuilt.
- **Our own Sources setting.** Rejected: it duplicates a checklist dnd5e already keeps for the same purpose.
