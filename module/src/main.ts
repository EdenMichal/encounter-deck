import { CHANGED_HOOK, MODULE_ID } from "./constants";
import { preventTokenlessDuplicates } from "./combatants";
import { registerSettings } from "./settings";
import { ensureStorage, watchChanges } from "./store";
import { createCombatTab } from "./ui/combat-tab";
import { startBuilder } from "./ui/builder";
import { checkTokenBar, startFinish } from "./finish";
import { startStatBlockTabs } from "./ui/statblocks";

Hooks.once("init", () => {
  registerSettings();
  // Subclass whatever the Combat tab is (dnd5e's CombatTracker5e), so ui.combat stays a real tracker.
  CONFIG.ui.combat = createCombatTab(CONFIG.ui.combat);
  // Every client, players included: their initiative rolls are where the duplicate would come from.
  preventTokenlessDuplicates();

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
  startStatBlockTabs();
  startFinish();
  Hooks.callAll(CHANGED_HOOK);
  checkTokenBar();
});
