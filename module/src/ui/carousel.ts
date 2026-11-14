/**
 * The Carousel: the running fight across the top of the screen, for everyone at the table. Square portrait cards
 * hang from the top edge in initiative order; the current one is larger and named. Heroes get a gold trim, statuses
 * and conditions show with Foundry's own icons, and only the GM gets turn controls, monster initiative and monster
 * HP (players see Bloodied). It replaces the Carousel Combat Tracker module, and stays hidden while that is active.
 *
 * For the GM it also shows legendary uses as pips under a monster's card, and the Legendary Prompt under the strip:
 * when a turn ends, every legendary monster that didn't just act, with its legendary actions as buttons, plus the
 * recharge abilities of the monster whose turn it is.
 */
import { MODULE_ID, T } from "../constants";
import { buildCards, canSeeCarousel, type Audience, type CombatantInput } from "../carousel-model";
import { legendaryActions, legendaryOf, promptRows, rechargeAbilities, type PromptCandidate } from "../legendary";
import { setSetting, setting } from "../settings";
import { isMonster, keepStatBlockClear, showStatBlock } from "./statblocks";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const OLD_CAROUSEL = "combat-tracker-dock";
const TRIM = `modules/${MODULE_ID}/assets/hero-trim.png`;

let instance: Carousel | null = null;

export function startCarousel(): void {
  instance = new Carousel();
  instance.render({ force: true });
  const refresh = foundry.utils.debounce(() => instance?.render(), 50);
  // Before the refresh, so the Legendary Prompt knows whose turn just ended.
  Hooks.on("updateCombat", (combat: any, changed: any, options: any) => instance?.onCombatUpdate(combat, changed, options));
  for (const hook of [
    "createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant",
    "updateActor", "updateToken", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "canvasReady", "createSetting", "updateSetting",
    // An imported token's actor is synthetic: spending legendary actions or a recharge updates its delta and items.
    "updateActorDelta", "createItem", "updateItem", "deleteItem",
  ]) Hooks.on(hook, refresh);
}

/** Where a fight stands: which combatant's turn it is, in which round. */
interface TurnMark { combatId: string; combatantId: string | null; round: number; turn: number | null }
const markOf = (combat: any): TurnMark | null =>
  combat ? { combatId: combat.id, combatantId: combat.combatant?.id ?? null, round: combat.round, turn: combat.turn } : null;
const sameTurn = (a: TurnMark | null, b: TurnMark | null) =>
  !!a && !!b && a.combatId === b.combatId && a.round === b.round && a.turn === b.turn;

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
      edDismissPrompt: function (this: Carousel) { this.dismissed = true; return this.render(); },
    },
  };

  /** The turn on screen, and the one before it: whose turn just ended is who the Legendary Prompt leaves out. */
  turn: TurnMark | null = markOf(shownCombat());
  ended: TurnMark | null = null;
  /** The Prompt belongs to this turn; it clears when the turn changes, or when the GM closes it. */
  promptFor: TurnMark | null = null;
  dismissed = false;

  /** The card whose full list of statuses is open under it. */
  expanded: string | null = null;

  static PARTS = { strip: { template: T("carousel") }, prompt: { template: T("legendary-prompt") } };

  /**
   * Every client sees every turn change. Moving forward (Next Turn, End Turn, a new round, Begin Combat) raises the
   * Prompt for the new turn; going back clears it.
   */
  onCombatUpdate(combat: any, changed: any, options: any): void {
    if (!("turn" in changed) && !("round" in changed)) return;
    if (combat !== shownCombat()) return;
    const now = markOf(combat);
    if (sameTurn(now, this.turn)) return;
    const forward = options?.direction !== -1;
    const before = this.turn;
    this.ended = forward && before && before.combatId === combat.id && before.round >= 1 ? before : null;
    this.turn = now;
    this.promptFor = forward ? now : null;
    this.dismissed = false;
  }

  /** The Legendary Prompt for the GM, or null when there's nothing to show. */
  promptContext(combat: any) {
    if (!game.user.isGM || this.dismissed || !combat?.started || !sameTurn(this.promptFor, markOf(combat))) return null;
    const candidates: PromptCandidate[] = combat.turns
      .filter((c: any) => isPlainMonster(c) && legendaryOf(c.actor?.system))
      .map((c: any) => ({
        id: c.id, name: c.name, img: c.img || c.actor?.img || CONST.DEFAULT_TOKEN, defeated: !!c.isDefeated,
        legendary: legendaryOf(c.actor.system), actions: legendaryActions(c.actor.items),
      }));
    const rows = this.ended?.combatantId ? promptRows(candidates, this.ended.combatantId) : [];
    const current = combat.combatant;
    const recharge = isPlainMonster(current) && !current.isDefeated ? rechargeAbilities(current.actor?.items) : [];
    if (!rows.length && !recharge.length) return null;
    return {
      rows: rows.map(r => ({ ...r, actions: r.actions.map(a => ({ ...a, showCost: a.cost > 1 })) })),
      recharge: recharge.length ? { name: current.name, abilities: recharge } : null,
      autoRecharge: game.settings.get("dnd5e", "autoRecharge") !== "no",
    };
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
    if (!show) return { show: false, prompt: null };
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
      prompt: this.promptContext(combat),
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
    if (context.prompt) keepStatBlockClear();
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
    this.element.addEventListener("scroll", () => this.placePopover(), true);
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
 * starts off). Ask once whether to turn it on, so the Legendary Prompt's recharge list stays true by itself.
 */
export async function checkAutoRecharge(): Promise<void> {
  if (setting("rechargeAsked")) return;
  let current: string;
  try { current = game.settings.get("dnd5e", "autoRecharge"); } catch { return; }
  if (current !== "no") return void setSetting("rechargeAsked", true);
  const turnOn = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Encounter Deck" },
    content: `<p>dnd5e can roll a monster's recharge (like a dragon's breath, 5–6) at the start of its turn, but that's switched off in this world.</p>
      <p>Turn on dnd5e's Auto-recharge? Encounter Deck's Legendary Prompt then shows which abilities are ready. You won't be asked again.</p>`,
    yes: { label: "Turn it on", icon: "fa-solid fa-bolt" },
    no: { label: "Keep it off" },
    rejectClose: false,
  }).catch(() => false);
  await setSetting("rechargeAsked", true);
  if (turnOn) await game.settings.set("dnd5e", "autoRecharge", "yes");
}
