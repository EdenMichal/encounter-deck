/**
 * The Carousel: the running fight across the top of the screen, for everyone at the table. Square portrait cards
 * hang from the top edge in initiative order; the current one is larger and named. Heroes get a gold trim, statuses
 * and conditions show with Foundry's own icons, and only the GM gets turn controls, monster initiative and monster
 * HP (players see Bloodied). It replaces the Carousel Combat Tracker module, and stays hidden while that is active.
 *
 * For the GM it also shows legendary actions and resistances as pips under a monster's card. Hovering them opens the
 * Legendary Menu: that monster's legendary actions as buttons, its resistances left and its recharge abilities.
 */
import { MODULE_ID, T } from "../constants";
import { buildCards, canSeeCarousel, type Audience, type CombatantInput } from "../carousel-model";
import { legendaryActions, legendaryMenu, legendaryOf, rechargeAbilities, resistanceOf } from "../legendary";
import { setSetting, setting } from "../settings";
import { isMonster, showStatBlock } from "./statblocks";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const OLD_CAROUSEL = "combat-tracker-dock";
const TRIM = `modules/${MODULE_ID}/assets/hero-trim.png`;

let instance: Carousel | null = null;

export function startCarousel(): void {
  instance = new Carousel();
  instance.render({ force: true });
  const refresh = foundry.utils.debounce(() => instance?.render(), 50);
  for (const hook of [
    "createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant",
    "updateActor", "updateToken", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "canvasReady", "createSetting", "updateSetting",
    // An imported token's actor is synthetic: spending legendary actions or a recharge updates its delta and items.
    "updateActorDelta", "createItem", "updateItem", "deleteItem",
  ]) Hooks.on(hook, refresh);
}

/** The pips and the Legendary Menu: the mouse can move between them without the menu closing. */
const menuZone = (target: EventTarget | null): HTMLElement | null =>
  (target as HTMLElement | null)?.closest?.<HTMLElement>(".ed-car-legend, .ed-car-lm") ?? null;

const isPlainMonster = (c: any): boolean => isMonster(c) && !c.hasPlayerOwner;

/** The user Monk's Common Display shows the map on. */
function isTableDisplay(): boolean {
  if (!game.modules.get("monks-common-display")?.active) return false;
  try { return !!game.settings.get("monks-common-display", "playerdata")?.[game.user.id]?.display; } catch { return false; }
}

const oldCarouselActive = () => !!game.modules.get(OLD_CAROUSEL)?.active;

/**
 * The fight to show: the one on the scene you're viewing, else whichever combat is active. Clients with no canvas
 * (a phone, a second screen) view no scene, so game.combat is empty for them.
 */
const shownCombat = (): any => game.combat ?? game.combats.find((c: any) => c.active && c.started) ?? null;

/** The effects a token shows an icon for, by the same rule Foundry uses: Always, or Conditional while temporary. */
function shownEffects(actor: any): any[] {
  const SHOW = CONST.ACTIVE_EFFECT_SHOW_ICON ?? { CONDITIONAL: 1, ALWAYS: 2 };
  const effects = [...(actor?.appliedEffects ?? actor?.effects ?? [])];
  return effects.filter((e: any) => {
    if (!e.img || e.disabled || e.active === false) return false;
    if (e.showIcon === undefined) return e.isTemporary || (e.statuses?.size ?? 0) > 0;
    return e.showIcon === SHOW.ALWAYS || (e.showIcon === SHOW.CONDITIONAL && !!e.isTemporary);
  });
}

function inputOf(c: any): CombatantInput {
  const hp = c.actor?.system?.attributes?.hp;
  const ac = Number(c.actor?.system?.attributes?.ac?.value);
  const seen = new Set<string>();
  const statuses = shownEffects(c.actor)
    .filter((e: any) => !seen.has(e.img) && seen.add(e.img))
    .map((e: any) => ({ img: e.img, name: e.name }));
  return {
    id: c.id,
    name: c.name,
    img: c.img || c.token?.texture?.src || c.actor?.img || CONST.DEFAULT_TOKEN,
    initiative: Number.isFinite(c.initiative) ? c.initiative : null,
    hero: !!c.hasPlayerOwner || c.actor?.type === "character",
    hidden: !!c.hidden,
    defeated: !!c.isDefeated,
    hp: hp && Number.isFinite(hp.max) ? { value: Number(hp.value) || 0, max: Number(hp.max) } : null,
    ac: Number.isFinite(ac) ? ac : null,
    statuses,
    legendary: isPlainMonster(c) ? legendaryOf(c.actor?.system) : null,
    resistance: isPlainMonster(c) ? resistanceOf(c.actor?.system) : null,
  };
}

class Carousel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-deck-carousel",
    tag: "section",
    classes: ["encounter-deck", "ed-carousel"],
    window: { frame: false, positioned: false },
    actions: {
      edPrevTurn: () => shownCombat()?.previousTurn(),
      edNextTurn: () => shownCombat()?.nextTurn(),
      edCard: function (this: Carousel, _event: Event, target: HTMLElement) { return this.focusToken(target); },
      edMoreStatuses: function (this: Carousel, _event: Event, target: HTMLElement) {
        const id = target.closest<HTMLElement>("[data-combatant-id]")?.dataset.combatantId ?? null;
        this.expanded = this.expanded === id ? null : id;
        return this.render();
      },
      edLegendary: function (this: Carousel, event: Event, target: HTMLElement) { return this.useLegendary(event, target); },
    },
  };

  /** The monster whose Legendary Menu is open (its pips are hovered), and the pending close when the mouse leaves. */
  legendFor: string | null = null;
  closeTimer: ReturnType<typeof setTimeout> | null = null;

  /** The card whose full list of statuses is open under it. */
  expanded: string | null = null;

  static PARTS = { strip: { template: T("carousel") } };

  /** The Legendary Menu of the hovered monster, for the GM; null when none is open or it has nothing to show. */
  menuContext(combat: any) {
    const c = this.legendFor ? combat?.combatants.get(this.legendFor) : null;
    if (!game.user.isGM || !isPlainMonster(c) || c.isDefeated) return null;
    const system = c.actor?.system;
    const legendary = legendaryOf(system), resistance = resistanceOf(system);
    if (!legendary && !resistance) return null;
    return {
      ...legendaryMenu({
        id: c.id, name: c.name, legendary, resistance, ownTurn: combat.combatant?.id === c.id,
        actions: legendaryActions(c.actor.items), recharge: rechargeAbilities(c.actor.items),
      }),
      autoRecharge: game.settings.get("dnd5e", "autoRecharge") !== "no",
    };
  }

  /** Open a monster's Legendary Menu (hovering its pips). */
  openMenu(id: string): void {
    this.cancelClose();
    if (this.legendFor === id) return;
    this.legendFor = id;
    this.render();
  }

  /** Close it a moment after the mouse leaves, so it can cross the gap between the pips and the menu. */
  closeMenuSoon(): void {
    this.cancelClose();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (!this.legendFor) return;
      this.legendFor = null;
      this.render();
    }, 250);
  }

  cancelClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  /**
   * A legendary action button: use that activity through dnd5e, which spends the legendary uses. The button already
   * shows the cost, so skip dnd5e's "Consume Legendary Action?" dialog.
   */
  async useLegendary(event: Event, target: HTMLElement): Promise<void> {
    const { combatantId, itemId, activityId } = target.dataset;
    const actor = shownCombat()?.combatants.get(combatantId)?.actor;
    const activity = actor?.items.get(itemId)?.system.activities?.get(activityId);
    if (!activity) return void ui.notifications.warn("That legendary action is gone.");
    await activity.use({ event }, { configure: false });
  }

  async _insertElement(element: HTMLElement) {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (document.getElementById("ui-top") ?? document.body).append(element);
  }

  async _prepareContext() {
    const combat = shownCombat();
    const isGM = game.user.isGM;
    const show = !!combat?.started && !oldCarouselActive()
      && canSeeCarousel(setting("carouselAudience") as Audience, { isGM, isTable: isTableDisplay() });
    if (!show) return { show: false, legend: null };
    const cards = buildCards(combat.turns.map(inputOf), combat.combatant?.id ?? null, isGM);
    const open = cards.find(c => c.id === this.expanded && c.more > 0);
    if (!open) this.expanded = null;
    return {
      show,
      isGM,
      round: combat.round,
      cards,
      popover: open ? { id: open.id, name: open.name, statuses: open.allStatuses } : null,
      trim: TRIM,
      deadIcon: CONFIG.controlIcons?.defeated ?? "icons/svg/skull.svg",
      legend: this.menuContext(combat),
    };
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options);
    this.element.classList.toggle("ed-hidden", !context.show);
    // Keep the current card in view when the fight is wider than the screen.
    const list = (this.element as HTMLElement).querySelector<HTMLElement>(".ed-car-list");
    const current = (this.element as HTMLElement).querySelector<HTMLElement>(".ed-car-item.current");
    if (list && current && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    }
    this.placePopover();
    this.liftMenu();
  }

  /**
   * The Legendary Menu has to sit above every window (a Stat Block opens right under the Carousel), so it moves out
   * to the page's top layer, with its own listeners since it's no longer inside the app.
   */
  liftMenu(): void {
    document.querySelectorAll("body > .ed-car-lm").forEach(el => el.remove());
    const menu = (this.element as HTMLElement).querySelector<HTMLElement>(".ed-car-lm");
    if (!menu) return;
    document.body.append(menu);
    menu.addEventListener("pointerover", () => this.cancelClose());
    menu.addEventListener("pointerout", (event: PointerEvent) => { if (!menuZone(event.relatedTarget)) this.closeMenuSoon(); });
    menu.addEventListener("click", (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="edLegendary"]');
      if (button && button.getAttribute("aria-disabled") !== "true") this.useLegendary(event, button);
    });
    this.placeMenu();
  }

  /** Put the open list of statuses just under its card, kept inside the carousel. */
  placePopover(): void {
    const root = this.element as HTMLElement;
    const popover = root.querySelector<HTMLElement>(".ed-car-popover");
    const item = popover && root.querySelector<HTMLElement>(`.ed-car-item[data-combatant-id="${popover.dataset.for}"]`);
    if (!popover || !item) return;
    const box = root.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    const left = Math.min(Math.max(0, at.left - box.left), Math.max(0, box.width - popover.offsetWidth));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(at.bottom - box.top + 4)}px`;
  }

  /** Put the Legendary Menu just under its monster's pips, kept on screen. */
  placeMenu(): void {
    const menu = document.querySelector<HTMLElement>("body > .ed-car-lm");
    const pipsEl = menu && (this.element as HTMLElement).querySelector<HTMLElement>(`.ed-car-item[data-combatant-id="${menu.dataset.for}"] .ed-car-legend`);
    if (!menu || !pipsEl) return;
    const at = pipsEl.getBoundingClientRect();
    const centre = at.left + at.width / 2 - menu.offsetWidth / 2;
    menu.style.left = `${Math.round(Math.min(Math.max(8, centre), window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.round(at.bottom + 4)}px`;
    // An action's description opens beside the menu, on whichever side has more room.
    const side = at.left + at.width / 2 > window.innerWidth / 2 ? "LEFT" : "RIGHT";
    for (const button of menu.querySelectorAll<HTMLElement>("button[data-tooltip]")) button.dataset.tooltipDirection = side;
  }

  async _onFirstRender(context: any, options: any) {
    await super._onFirstRender(context, options);
    // A wide fight scrolls sideways with the mouse wheel.
    this.element.addEventListener("wheel", (event: WheelEvent) => {
      const list = (event.target as HTMLElement).closest<HTMLElement>(".ed-car-list");
      if (!list || list.scrollWidth <= list.clientWidth) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY || event.deltaX;
    }, { passive: false });
    // The list of statuses closes on a click anywhere else, or on scrolling the strip.
    document.addEventListener("pointerdown", (event: PointerEvent) => {
      if (!this.expanded) return;
      const target = event.target as HTMLElement;
      if (target.closest?.(".ed-car-popover, .ed-car-more")) return;
      this.expanded = null;
      this.render();
    }, true);
    this.element.addEventListener("scroll", () => { this.placePopover(); this.placeMenu(); }, true);
    // Hovering a monster's pips opens its Legendary Menu; it stays open while the mouse is on the pips or the menu.
    this.element.addEventListener("pointerover", (event: PointerEvent) => {
      const pipsEl = (event.target as HTMLElement).closest?.<HTMLElement>(".ed-car-legend");
      const id = pipsEl?.closest<HTMLElement>("[data-combatant-id]")?.dataset.combatantId;
      if (id) this.openMenu(id);
    });
    this.element.addEventListener("pointerout", (event: PointerEvent) => {
      if (menuZone(event.target) && !menuZone(event.relatedTarget)) this.closeMenuSoon();
    });
    // The GM double-clicks a monster to open its Stat Block, as in the tracker.
    this.element.addEventListener("dblclick", (event: MouseEvent) => {
      if (!game.user.isGM) return;
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-combatant-id]")?.dataset.combatantId;
      const combatant = id ? shownCombat()?.combatants.get(id) : null;
      if (isMonster(combatant)) showStatBlock(combatant);
    });
  }

  /** A click on a card selects and pans to its token, for the GM or the token's owner. */
  focusToken(target: HTMLElement): void {
    const id = target.closest<HTMLElement>("[data-combatant-id]")?.dataset.combatantId;
    const combatant = id ? shownCombat()?.combatants.get(id) : null;
    const token = combatant?.token?.object;
    if (!token || !(game.user.isGM || combatant.isOwner)) return;
    token.control({ releaseOthers: true });
    canvas.animatePan({ x: token.center.x, y: token.center.y });
  }
}

/**
 * Carousel Combat Tracker draws its own carousel in the same place. Ask once whether to turn it off; until it's off,
 * ours stays hidden so there are never two.
 */
export async function checkCarouselTakeover(): Promise<void> {
  if (!oldCarouselActive() || setting("carouselTakeoverAsked")) return;
  const turnOff = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Encounter Deck" },
    content: `<p>Carousel Combat Tracker is active. Encounter Deck now has its own carousel, and two would sit on top of each other.</p>
      <p>Turn Carousel Combat Tracker off? Foundry reloads for everyone. Until then, the Encounter Deck carousel stays hidden. You won't be asked again.</p>`,
    yes: { label: "Turn it off", icon: "fa-solid fa-power-off" },
    no: { label: "Keep it" },
    rejectClose: false,
  }).catch(() => false);
  await setSetting("carouselTakeoverAsked", true);
  if (!turnOff) return;
  const config = game.settings.get("core", "moduleConfiguration") ?? {};
  await game.settings.set("core", "moduleConfiguration", { ...config, [OLD_CAROUSEL]: false });
  foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
}

/**
 * dnd5e rolls a monster's recharge at the start of its turn, but only once its "Auto-recharge" setting is on (it
 * starts off). Ask once whether to turn it on, so the Legendary Menu's recharge list stays true by itself.
 */
export async function checkAutoRecharge(): Promise<void> {
  if (setting("rechargeAsked")) return;
  let current: string;
  try { current = game.settings.get("dnd5e", "autoRecharge"); } catch { return; }
  if (current !== "no") return void setSetting("rechargeAsked", true);
  const turnOn = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Encounter Deck" },
    content: `<p>dnd5e can roll a monster's recharge (like a dragon's breath, 5–6) at the start of its turn, but that's switched off in this world.</p>
      <p>Turn on dnd5e's Auto-recharge? Encounter Deck's Legendary Menu (hover a monster's legendary pips) then shows which abilities are ready. You won't be asked again.</p>`,
    yes: { label: "Turn it on", icon: "fa-solid fa-bolt" },
    no: { label: "Keep it off" },
    rejectClose: false,
  }).catch(() => false);
  await setSetting("rechargeAsked", true);
  if (turnOn) await game.settings.set("dnd5e", "autoRecharge", "yes");
}
