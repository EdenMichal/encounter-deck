import { CHANGED_HOOK, MODULE_ID } from "./constants";
import { registerSettings } from "./settings";
import { ensureStorage, watchChanges } from "./store";
import { createCombatTab } from "./ui/combat-tab";
import { startBuilder } from "./ui/builder";

Hooks.once("init", () => {
  registerSettings();
  // Subclass whatever the Combat tab is (dnd5e's CombatTracker5e), so ui.combat stays a real tracker.
  CONFIG.ui.combat = createCombatTab(CONFIG.ui.combat);

  // Foundry caches module.json until the world is relaunched; make sure the stylesheet is there either way.
  const css = `modules/${MODULE_ID}/styles/encounter-deck.css`;
  if (![...document.styleSheets].some(s => s.href?.endsWith(css))) {
    document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${css}">`);
  }
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  watchChanges();
  try {
    await ensureStorage();
  } catch (err) {
    console.error("Encounter Deck | Could not set up the compendium", err);
    ui.notifications.error("Encounter Deck could not create its compendium. See the console for details.");
  }
  startBuilder();
  Hooks.callAll(CHANGED_HOOK);
});
