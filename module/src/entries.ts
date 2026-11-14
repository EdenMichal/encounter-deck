/**
 * Creature Entries: an Encounter's lines ("Goblin ×4"). Stored as dnd5e's system.members (uuid + quantity)
 * plus our saved copy of each monster in flags (ADR 0003). Pure, so it can be tested without Foundry.
 */
import type { EntryCache } from "./constants";

export interface CreatureEntry extends EntryCache {
  count: number;
  /** The monster's Source (or the monster) is gone; the row shows its saved name and CR. */
  missing: boolean;
}

export interface Member { uuid: string; quantity: { value: number | null; formula?: string } }

export type Lookup = (uuid: string) => EntryCache | null;

/** Read an Encounter's entries. `lookup` returns the live monster, or null when it's missing. */
export function readEntries(members: Member[] = [], cache: EntryCache[] = [], lookup: Lookup): CreatureEntry[] {
  return members.map(m => {
    const live = lookup(m.uuid);
    const saved = cache.find(c => c.uuid === m.uuid);
    const unknown: EntryCache = { uuid: m.uuid, name: "Unknown creature", img: "", cr: null, xp: 0 };
    // A live monster whose CR isn't indexed keeps the saved CR and XP.
    const base: EntryCache = live
      ? { ...live, cr: live.cr ?? saved?.cr ?? null, xp: live.cr !== null ? live.xp : saved?.xp ?? 0 }
      : saved ?? unknown;
    return { ...base, uuid: m.uuid, count: Math.max(0, m.quantity?.value ?? 1), missing: !live };
  });
}

export function addEntry(entries: CreatureEntry[], monster: EntryCache, count = 1): CreatureEntry[] {
  const existing = entries.find(e => e.uuid === monster.uuid);
  if (existing) return entries.map(e => (e === existing ? { ...e, count: e.count + count } : e));
  return [...entries, { ...monster, count, missing: false }];
}

/** Add every creature of another Encounter: counts add up for monsters already here, the rest join at the end. */
export function mergeEntries(entries: CreatureEntry[], incoming: CreatureEntry[]): CreatureEntry[] {
  let merged = entries;
  for (const { count, missing, ...monster } of incoming) {
    if (count <= 0) continue;
    const had = merged.some(e => e.uuid === monster.uuid);
    merged = addEntry(merged, monster, count);
    if (!had && missing) merged = merged.map(e => (e.uuid === monster.uuid ? { ...e, missing } : e));
  }
  return merged;
}

/** +/− on a row. The count never drops below 1; removing is its own action. */
export function changeCount(entries: CreatureEntry[], uuid: string, delta: number): CreatureEntry[] {
  return entries.map(e => (e.uuid === uuid ? { ...e, count: Math.max(1, e.count + delta) } : e));
}

export function removeEntry(entries: CreatureEntry[], uuid: string): CreatureEntry[] {
  return entries.filter(e => e.uuid !== uuid);
}

/** Swap a (usually missing) row's monster for another, keeping its count. Merges if the new one is already there. */
export function swapEntry(entries: CreatureEntry[], uuid: string, monster: EntryCache): CreatureEntry[] {
  const old = entries.find(e => e.uuid === uuid);
  if (!old) return entries;
  if (monster.uuid === uuid) return entries.map(e => (e === old ? { ...monster, count: e.count, missing: false } : e));
  const rest = removeEntry(entries, uuid);
  const index = entries.indexOf(old);
  if (rest.some(e => e.uuid === monster.uuid)) return addEntry(rest, monster, old.count);
  rest.splice(index, 0, { ...monster, count: old.count, missing: false });
  return rest;
}

export function totalXp(entries: CreatureEntry[]): number {
  return entries.reduce((xp, e) => xp + e.count * (e.xp || 0), 0);
}

export function totalCount(entries: CreatureEntry[]): number {
  return entries.reduce((n, e) => n + e.count, 0);
}

/** What to write back: dnd5e's members, and our saved copies. */
export function toSource(entries: CreatureEntry[]): { members: Member[]; cache: EntryCache[] } {
  return {
    members: entries.map(e => ({ uuid: e.uuid, quantity: { value: e.count } })),
    cache: entries.map(({ uuid, name, img, cr, xp }) => ({ uuid, name, img, cr, xp })),
  };
}
