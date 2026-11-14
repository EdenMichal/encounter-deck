import { CHANGED_HOOK, MODULE_ID } from "./constants";
import { preventTokenlessDuplicates } from "./combatants";
import { registerSettings } from "./settings";
import { ensureStorage, watchChanges } from "./store";
import { createCombatTab } from "./ui/combat-tab";
import { startBuilder } from "./ui/builder";
import { checkTokenBar, startFinish } from "./finish";
import { startStatBlocks } from "./ui/statblocks";
import { checkCarouselTakeover, startCarousel } from "./ui/carousel";

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
  // Everyone at the table gets the carousel; the rest is the GM's.
  startCarousel();
  if (!game.user.isGM) return;
  watchChanges();
  try {
    await ensureStorage();
  } catch (err) {
    console.error("Encounter Deck | Could not set up the compendium", err);
    ui.notifications.error("Encounter Deck could not create its compendium. See the console for details.");
  }
  startBuilder();
  startStatBlocks();
  startFinish();
  Hooks.callAll(CHANGED_HOOK);
  checkTokenBar();
  checkCarouselTakeover();
});
