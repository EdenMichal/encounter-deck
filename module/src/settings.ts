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
  game.settings.register(MODULE_ID, "builderCollapsed", { scope: "client", config: false, type: Boolean, default: false });
}

export const setting = (key: string) => game.settings.get(MODULE_ID, key);
export const setSetting = (key: string, value: unknown) => game.settings.set(MODULE_ID, key, value);
