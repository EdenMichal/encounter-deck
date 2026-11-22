import { CHANGED_HOOK, MODULE_ID } from "./constants";
import { preventTokenlessDuplicates } from "./combatants";
import { registerSettings } from "./settings";
import { ensureStorage, watchChanges } from "./store";
import { createCombatTab } from "./ui/combat-tab";
import { startBuilder } from "./ui/builder";
import { checkTokenBar, startFinish } from "./finish";
import { startStatBlocks } from "./ui/statblocks";
import { checkAutoRecharge, checkCarouselTakeover, startCarousel } from "./ui/carousel";
import { startLoot } from "./ui/loot";
import { fileLooseCompleted, startCompletedFolders } from "./completed";
import { startDisplayFollow } from "./ui/display-follow";
import { checkMonkBar, registerRollRequests, startPartyBar } from "./ui/party-bar";

Hooks.once("init", () => {
  registerSettings();
  // Every client: a player's own client runs the handler when they press Roll on a Party Bar request.
  registerRollRequests();
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
  // The table display is a player client: keep it from following monsters into the Margin.
  startDisplayFollow();
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
  startLoot();
  startCompletedFolders();
  fileLooseCompleted().catch((err: unknown) => console.error("Encounter Deck | Couldn't file the Completed Encounters", err));
  startPartyBar();
  Hooks.callAll(CHANGED_HOOK);
  checkTokenBar();
  checkCarouselTakeover();
  checkAutoRecharge();
  checkMonkBar();
});
