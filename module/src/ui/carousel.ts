/**
 * The Carousel: the running fight across the top of the screen, for everyone at the table. Square portrait cards
 * hang from the top edge in initiative order; the current one is larger and named. Heroes get a gold trim, statuses
 * and conditions show with Foundry's own icons, and only the GM gets turn controls, monster initiative and monster
 * HP (players see Bloodied). It replaces the Carousel Combat Tracker module, and stays hidden while that is active.
 */
import { MODULE_ID, T } from "../constants";
import { buildCards, canSeeCarousel, type Audience, type CombatantInput } from "../carousel-model";
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
  ]) Hooks.on(hook, refresh);
}

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
    statuses,
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
    },
  };

  static PARTS = { strip: { template: T("carousel") } };

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
    if (!show) return { show: false };
    return {
      show,
      isGM,
      round: combat.round,
      cards: buildCards(combat.turns.map(inputOf), combat.combatant?.id ?? null, isGM),
      trim: TRIM,
      deadIcon: CONFIG.controlIcons?.defeated ?? "icons/svg/skull.svg",
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
