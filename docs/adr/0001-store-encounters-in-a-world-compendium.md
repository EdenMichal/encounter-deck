# Store encounters in a module-created world compendium

Encounters live in a world compendium that the module creates the first time it runs. Campaigns and the Shared Library are folders inside it. We chose this to keep the world light: Foundry loads only a small index of compendium contents at startup. That lets the module fetch just the Active Campaign and the Shared Library, and skip Completed encounters.

## Considered Options

- **Hidden Journal entries.** Rejected: every one loads into the world at startup, which is the weight the user wants to avoid.
- **A single world setting holding everything.** Rejected: it all loads at startup, and every save rewrites the whole thing.
- **A compendium shipped inside the module folder.** Rejected: it gets replaced on every module update, destroying the GM's data.
