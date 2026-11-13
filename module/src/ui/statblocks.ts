/**
 * Stat Block Tabs: a slim strip of portraits docked on the sidebar's left edge, one tab per monster in the running
 * fight. Selecting a tab opens that monster's own dnd5e sheet in one fixed spot, replacing the previous one. Next or
 * Previous Turn selects the monster whose turn it is (PC turns leave the selection alone), and double-clicking a
 * monster in the tracker selects it too.
 */
import { T } from "../constants";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const STRIP_WIDTH = 44;
const GAP = 8;

let instance: StatBlockTabs | null = null;
export const statBlockTabs = () => instance;

/** Monsters get tabs; player characters don't. */
export const isMonster = (combatant: any): boolean => !!combatant?.actor && combatant.actor.type === "npc";

export function startStatBlockTabs(): void {
  if (!game.user.isGM) return;
  instance = new StatBlockTabs();
  instance.render({ force: true });
  const refresh = foundry.utils.debounce(() => instance?.render({ parts: ["tabs"] }), 50);
  for (const hook of ["createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) Hooks.on(hook, refresh);
  Hooks.on("updateCombat", (combat: any, changed: any) => {
    refresh();
    const turnChanged = "turn" in changed || "round" in changed;
    if (turnChanged && combat.started && combat === ui.combat?.viewed && isMonster(combat.combatant)) instance?.select(combat.combatant.id);
  });
  Hooks.on("deleteCombat", (combat: any) => { if (instance && instance.combatId === combat.id) instance.clear(); });
}

class StatBlockTabs extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-deck-statblocks",
    tag: "nav",
    classes: ["encounter-deck", "ed-statblocks"],
    window: { frame: false, positioned: false },
    actions: {
      edSelectTab: function (this: StatBlockTabs, _event: Event, target: HTMLElement) {
        return this.select(target.dataset.combatantId!, { toggle: true });
      },
    },
  };

  static PARTS = { tabs: { template: T("statblock-tabs"), scrollable: [".ed-sb-tabs"] } };

  /** The selected combatant, and the combat it belongs to. */
  selected: string | null = null;
  combatId: string | null = null;
  /** The sheet this strip opened, so the next selection can replace it. */
  #sheet: any = null;

  get combat(): any {
    return ui.combat?.viewed ?? game.combat ?? null;
  }

  async _insertElement(element: HTMLElement) {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (document.getElementById("sidebar") ?? document.body).append(element);
  }

  async _prepareContext() {
    const combat = this.combat;
    const tabs = (combat?.turns ?? []).filter(isMonster).map((c: any) => ({
      id: c.id,
      name: c.name,
      img: c.img || c.actor?.img || CONST.DEFAULT_TOKEN,
      selected: c.id === this.selected && combat.id === this.combatId,
      turn: combat.started && c.id === combat.combatant?.id,
      defeated: c.isDefeated,
    }));
    return { tabs };
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options);
    this.element.classList.toggle("ed-hidden", !context.tabs.length);
  }

  /** Select a monster's tab and show its sheet in the fixed spot. With `toggle`, selecting it again closes it. */
  async select(combatantId: string, { toggle = false } = {}): Promise<void> {
    const combat = this.combat;
    const combatant = combat?.combatants.get(combatantId);
    const sheet = combatant?.actor?.sheet;
    if (!sheet) return;
    if (toggle && this.selected === combatantId && this.#sheet === sheet && sheet.rendered) {
      this.clear();
      return;
    }
    if (this.#sheet && this.#sheet !== sheet && this.#sheet.rendered) this.#sheet.close();
    this.selected = combatantId;
    this.combatId = combat.id;
    this.#sheet = sheet;
    await sheet.render({ force: true, position: this.spotFor(sheet) });
    sheet.bringToFront?.();
    this.render({ parts: ["tabs"] });
  }

  /** The fixed spot: just left of the strip, near the top. */
  spotFor(sheet: any): { left: number; top: number } {
    const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
    const width = Number(sheet.position?.width) || Number(sheet.options?.position?.width) || 600;
    const edge = (sidebar?.left ?? window.innerWidth) - STRIP_WIDTH - GAP;
    return { left: Math.max(GAP, edge - width), top: 60 };
  }

  clear(): void {
    if (this.#sheet?.rendered) this.#sheet.close();
    this.#sheet = null;
    this.selected = null;
    this.combatId = null;
    this.render({ parts: ["tabs"] });
  }
}
