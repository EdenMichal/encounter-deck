/**
 * Legendary actions, recharge and lairs for the Carousel's pips and the Legendary Prompt. Pure: the UI hands it
 * plain dnd5e data (an NPC's `system`, its items and their activities). dnd5e does the bookkeeping itself: spent
 * legendary actions reset at the end of the monster's own turn, using a legendary activity spends them, recharge is
 * rolled at turn start when its auto-recharge setting is on, and a monster inside its lair gets one more legendary
 * action and resistance. Encounter Deck only shows the GM what's there at the right moment.
 */

export interface Legendary { value: number; max: number }

export interface LegendaryAction {
  itemId: string;
  activityId: string;
  name: string;
  img: string;
  cost: number;
}

export interface RechargeAbility { name: string; ready: boolean; label: string }

/** Activation types that spend legendary actions (dnd5e's CONFIG.DND5E.activityActivationTypes). */
const LEGENDARY_TYPES = new Set(["legendary", "mythic"]);

const list = (x: any): any[] => (x ? [...x] : []);
const num = (x: unknown, fallback = 0): number => (Number.isFinite(Number(x)) ? Number(x) : fallback);

/** Uses left and maximum of one of dnd5e's legendary resources, or null when the monster has none. */
function usesOf(resource: any): Legendary | null {
  const max = num(resource?.max);
  if (max <= 0) return null;
  const value = resource?.value !== undefined ? num(resource.value) : max - num(resource?.spent);
  return { value: Math.min(max, Math.max(0, value)), max };
}

/** Legendary actions left and their maximum, or null for a monster without any. */
export const legendaryOf = (system: any): Legendary | null => usesOf(system?.resources?.legact);

/** Legendary resistances left and their maximum (one more inside its lair), or null for a monster without any. */
export const resistanceOf = (system: any): Legendary | null => usesOf(system?.resources?.legres);

/**
 * Every activity that costs legendary actions, cheapest first. Spells a feature casts (dnd5e's cached spells,
 * `flags.dnd5e.cachedFor`) are left out, as on the sheet: the feature that casts them is listed instead.
 */
export function legendaryActions(items: any): LegendaryAction[] {
  const out: LegendaryAction[] = [];
  for (const item of list(items)) {
    if (item?.flags?.dnd5e?.cachedFor) continue;
    const activities = list(item?.system?.activities).filter(a => LEGENDARY_TYPES.has(a?.activation?.type));
    for (const a of activities) {
      const own = String(a.name ?? "").trim();
      const name = activities.length > 1 && own && own !== item.name ? `${item.name}: ${own}` : item.name;
      out.push({ itemId: item.id, activityId: a.id, name, img: a.img || item.img || "", cost: Math.max(1, num(a.activation?.value, 1)) });
    }
  }
  return out.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

/** "5" → "5–6", "6" → "6": how the books print a recharge. */
export function rechargeLabel(formula: unknown): string {
  const n = num(formula, 6);
  return n >= 6 ? "6" : `${n}–6`;
}

const rechargeOf = (uses: any) => list(uses?.recovery).find(r => r?.period === "recharge") ?? null;

/** Abilities (an item, or one of its activities) that recharge on a d6, and whether each is ready now. */
export function rechargeAbilities(items: any): RechargeAbility[] {
  const out: RechargeAbility[] = [];
  const add = (name: string, uses: any) => {
    const r = rechargeOf(uses);
    if (r) out.push({ name, ready: num(uses?.spent) < Math.max(1, num(uses?.max, 1)), label: rechargeLabel(r.formula) });
  };
  for (const item of list(items)) {
    add(item.name, item.system?.uses);
    for (const a of list(item?.system?.activities)) {
      if (rechargeOf(item.system?.uses)) continue; // the item's own recharge covers its activities
      add(a.name && a.name !== item.name ? `${item.name}: ${a.name}` : item.name, a.uses);
    }
  }
  return out;
}

export interface PromptCandidate {
  id: string;
  name: string;
  img: string;
  defeated: boolean;
  legendary: Legendary | null;
  actions: LegendaryAction[];
}

export interface PromptRow {
  id: string;
  name: string;
  img: string;
  legendary: Legendary;
  pips: boolean[];
  actions: (LegendaryAction & { usable: boolean })[];
}

/** Filled pips for the uses left, empty ones for the uses spent. */
export const pips = (l: Legendary): boolean[] => Array.from({ length: l.max }, (_, i) => i < l.value);

/**
 * Who gets a row in the Legendary Prompt once a turn ends: every legendary monster that is still up, has uses left
 * and didn't just take that turn (legendary actions come at the end of another creature's turn).
 */
export function promptRows(candidates: PromptCandidate[], endedId: string | null): PromptRow[] {
  return candidates
    .filter(c => c.legendary && c.legendary.value > 0 && !c.defeated && c.id !== endedId)
    .map(c => ({
      id: c.id, name: c.name, img: c.img, legendary: c.legendary!, pips: pips(c.legendary!),
      actions: c.actions.map(a => ({ ...a, usable: a.cost <= c.legendary!.value })),
    }));
}

/**
 * The token delta that puts a monster inside its lair (2024 rules: one more legendary action and resistance, which
 * dnd5e adds itself). Null when it has no lair or the Encounter isn't in one.
 */
export function lairDelta(hasLair: boolean, inLair: boolean): object | null {
  return hasLair && inLair ? { system: { resources: { lair: { inside: true } } } } : null;
}
