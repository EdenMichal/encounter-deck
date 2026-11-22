import { CHANGED_HOOK, MODULE_ID, PARTY_BAR_HOOK } from "./constants";

const changed = () => Hooks.callAll(CHANGED_HOOK);
const partyBarChanged = () => Hooks.callAll(PARTY_BAR_HOOK);

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
  game.settings.register(MODULE_ID, "displayFollowsMargin", {
    name: "Table display follows tokens in the Margin",
    hint: "When Monk's Common Display follows the combat (or the GM's controlled tokens), it pans to whoever's turn it is. Monsters sit in the Margin, so on their turns the map slides away. Leave this off and the table display stays put on those turns.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  // Whether the GM has been asked once about turning off Carousel Combat Tracker.
  game.settings.register(MODULE_ID, "carouselTakeoverAsked", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "rechargeAsked", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "builderCollapsed", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "showPartyBar", {
    name: "Show the Party Bar",
    hint: "A small bar of the Active Campaign's Present PCs with their AC, passive scores, HP and Inspiration, and a button to request rolls. GM only; drag it by its grip.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: partyBarChanged,
  });
  // The Party Bar's stats (gear button), its spot ({left, top}, empty until dragged) and whether it's collapsed.
  game.settings.register(MODULE_ID, "partyBarStats", { scope: "client", config: false, type: Object, default: {}, onChange: partyBarChanged });
  game.settings.register(MODULE_ID, "partyBarPosition", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "partyBarCollapsed", { scope: "client", config: false, type: Boolean, default: false, onChange: partyBarChanged });
  // Whether this client has been asked once about turning off Monk's TokenBar's own bar (a per-client setting there).
  game.settings.register(MODULE_ID, "monkBarAsked", { scope: "client", config: false, type: Boolean, default: false });
}

export const setting = (key: string) => game.settings.get(MODULE_ID, key);
export const setSetting = (key: string, value: unknown) => game.settings.set(MODULE_ID, key, value);
