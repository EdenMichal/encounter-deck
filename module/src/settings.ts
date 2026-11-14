import { CHANGED_HOOK, MODULE_ID } from "./constants";

const changed = () => Hooks.callAll(CHANGED_HOOK);

export function registerSettings(): void {
  game.settings.register(MODULE_ID, "defaultAdvancement", {
    name: "Default Advancement Mode",
    hint: "How Campaigns level up unless a Campaign picks its own: XP or Milestone. XP values still drive difficulty either way.",
    scope: "world",
    config: true,
    type: String,
    choices: { xp: "XP", milestone: "Milestone" },
    default: "xp",
    onChange: changed,
  });
  // The Active Campaign, remembered per world.
  game.settings.register(MODULE_ID, "activeCampaign", { scope: "world", config: false, type: String, default: "", onChange: changed });
  game.settings.register(MODULE_ID, "showCompleted", { scope: "client", config: false, type: Boolean, default: false, onChange: changed });
  game.settings.register(MODULE_ID, "collapsedFolders", { scope: "client", config: false, type: Object, default: {} });
  // Whether the GM has been asked once about Monk's TokenBar's own XP dialog.
  game.settings.register(MODULE_ID, "tokenBarAsked", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "carouselAudience", {
    name: "Show the carousel to",
    hint: "Who sees the carousel across the top during a fight. Players and the table display never see monster initiative or exact monster HP: a monster at half HP or less shows Bloodied. The table display is the user Monk's Common Display shows the map on.",
    scope: "world",
    config: true,
    type: String,
    choices: { everyone: "Everyone", players: "GM and players, not the table display", gm: "GM only" },
    default: "everyone",
  });
  // Whether the GM has been asked once about turning off Carousel Combat Tracker.
  game.settings.register(MODULE_ID, "carouselTakeoverAsked", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "builderCollapsed", { scope: "client", config: false, type: Boolean, default: false });
}

export const setting = (key: string) => game.settings.get(MODULE_ID, key);
export const setSetting = (key: string, value: unknown) => game.settings.set(MODULE_ID, key, value);
