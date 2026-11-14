/**
 * Distribute Loot: the loot Monk's TokenBar gathers when a fight ends goes to the party instead of into a new
 * lootable. With Mobile Deck and a party inventory (a dnd5e Group), everything goes into the Group; otherwise the
 * GM picks who gets each item and the coins are split evenly between the Present PCs. Pure, so it can be tested:
 * ui/loot.ts reads TokenBar's dialog and writes to the actors.
 */

/** dnd5e's coins, highest first. */
export const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;
export type Coins = Partial<Record<string, number>>;

/** One kind of item to hand out: its item data and how many in total. */
export interface LootItem {
  key: string;
  name: string;
  img: string;
  quantity: number;
  data: any;
}

/** The parts of a TokenBar loot entry (one per monster kind) this reads. */
export interface TokenBarEntry {
  items: { id: string; name: string; img: string; quantity: number | string; data: any }[];
}

const whole = (x: unknown): number => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Every item to hand out. TokenBar's quantity is how many of that item the defeated carried (already rolled when it
 * was dice); each one is a stack of the item's own system.quantity. The same item from several monsters is one row.
 */
export function collectLoot(entries: TokenBarEntry[]): LootItem[] {
  const byKey = new Map<string, LootItem>();
  for (const entry of entries) {
    for (const loot of entry.items ?? []) {
      const count = whole(loot.quantity);
      if (!count) continue;
      const each = whole(loot.data?.system?.quantity) || 1;
      const key = `${loot.id}|${loot.name}`;
      const existing = byKey.get(key);
      if (existing) existing.quantity += count * each;
      else byKey.set(key, { key, name: loot.name, img: loot.img, quantity: count * each, data: loot.data });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Coins as whole numbers, only the ones there are. */
export function cleanCoins(currency: Record<string, unknown>): Coins {
  const out: Coins = {};
  for (const k of COINS) if (whole(currency?.[k])) out[k] = whole(currency[k]);
  return out;
}

export const hasCoins = (c: Coins): boolean => Object.values(c).some(v => (v ?? 0) > 0);

/** Each person's even share of every coin, and what's left over (it goes to one person the GM picks). */
export function splitCoins(currency: Coins, people: number): { each: Coins; leftover: Coins } {
  const each: Coins = {}, leftover: Coins = {};
  for (const k of COINS) {
    const total = whole(currency[k]);
    if (!total) continue;
    if (people <= 0) { leftover[k] = total; continue; }
    const share = Math.floor(total / people), rest = total - share * people;
    if (share) each[k] = share;
    if (rest) leftover[k] = rest;
  }
  return { each, leftover };
}

/** The pick dialog's starting choice: the PCs take turns, first item to the first PC. */
export const takeTurns = (items: LootItem[], people: string[]): Record<string, string> =>
  Object.fromEntries(people.length ? items.map((item, i) => [item.key, people[i % people.length]]) : []);

/** "28 gp, 4 sp": how the books write coins. Empty when there are none. */
export const coinText = (c: Coins): string => COINS.filter(k => (c[k] ?? 0) > 0).map(k => `${c[k]} ${k}`).join(", ");

/** Add coins to what an actor already has. */
export function addCoins(current: Record<string, unknown>, add: Coins): Coins {
  const out: Coins = {};
  for (const k of COINS) if (add[k]) out[k] = whole(current?.[k]) + whole(add[k]);
  return out;
}

/** The item data to create on a character or the party: the full stack, unequipped, with a fresh id. */
export function itemToGive(data: any, quantity: number): any {
  const copy = structuredClone(data ?? {});
  delete copy._id;
  copy.system = { ...(copy.system ?? {}), quantity };
  if (copy.system.equipped !== undefined) copy.system.equipped = false;
  if (copy.system.attuned !== undefined) copy.system.attuned = false;
  return copy;
}

const sourceOf = (d: any): string | null => d?._stats?.compendiumSource ?? d?.flags?.core?.sourceId ?? null;

/**
 * An item the receiver already has that this one stacks onto: same type and name, and the same source when both
 * know theirs. Only items that stack (have a quantity) count.
 */
export function stackTarget(existing: any[], data: any): any | null {
  return existing.find(i => i?.type === data?.type && i?.name === data?.name && i?.system?.quantity !== undefined
    && (!sourceOf(i) || !sourceOf(data) || sourceOf(i) === sourceOf(data))) ?? null;
}

/** Who got what, for one chat line: "Brienne: Longsword, 2 Potions of Healing (28 gp, 4 sp)". */
export function shareText(name: string, items: { name: string; quantity: number }[], coins: Coins): string {
  const things = items.map(i => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name));
  const money = coinText(coins);
  return `${name}: ${[things.join(", "), money].filter(Boolean).join(things.length && money ? "; " : "") || "nothing"}`;
}
