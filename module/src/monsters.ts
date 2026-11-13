/**
 * Monster search over the Sources' compendium indexes. Pure: sources.ts feeds it index entries.
 */
export interface Monster {
  uuid: string;
  name: string;
  img: string;
  cr: number | null;
  xp: number;
  type: string;
  size: string;
  habitats: string[];
  pack: string;
}

export interface MonsterFilter {
  name: string;
  crMin: number | null;
  crMax: number | null;
  type: string;
  size: string;
  habitat: string;
}

export const EMPTY_FILTER: MonsterFilter = { name: "", crMin: null, crMax: null, type: "", size: "", habitat: "" };

/** "1/4" → 0.25, "3" → 3, 0.5 → 0.5. */
export function parseCr(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const [n, d] = value.split("/").map(Number);
  const cr = d ? n / d : n;
  return Number.isFinite(cr) ? cr : null;
}

const get = (obj: any, path: string) => path.split(".").reduce((o, k) => o?.[k], obj);

/** An index entry from an Actor compendium, or null when it isn't an NPC. */
export function monsterFromIndex(entry: any, pack: string, crToXp: (cr: number | null) => number): Monster | null {
  if (entry?.type !== "npc") return null;
  const cr = parseCr(get(entry, "system.details.cr"));
  const habitat = get(entry, "system.details.habitat");
  return {
    uuid: entry.uuid ?? `Compendium.${pack}.Actor.${entry._id}`,
    name: entry.name ?? "",
    img: entry.img ?? "",
    cr,
    xp: crToXp(cr),
    type: get(entry, "system.details.type.value") ?? "",
    size: get(entry, "system.traits.size") ?? "",
    habitats: Array.isArray(habitat?.value) ? habitat.value.map((h: any) => h?.type).filter(Boolean) : [],
    pack,
  };
}

export function filterMonsters(list: Monster[], f: MonsterFilter): Monster[] {
  const words = f.name.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(m => {
    if (words.length) {
      const name = m.name.toLowerCase();
      if (!words.every(w => name.includes(w))) return false;
    }
    if (f.crMin !== null && (m.cr === null || m.cr < f.crMin)) return false;
    if (f.crMax !== null && (m.cr === null || m.cr > f.crMax)) return false;
    if (f.type && m.type !== f.type) return false;
    if (f.size && m.size !== f.size) return false;
    // A creature that lives "any"where matches every habitat.
    if (f.habitat && !m.habitats.includes(f.habitat) && !m.habitats.includes("any")) return false;
    return true;
  });
}

export function sortMonsters(list: Monster[]): Monster[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name) || (a.cr ?? 0) - (b.cr ?? 0));
}

/** Show 1/8, 1/4, 1/2 the way the books do. */
export function formatCr(cr: number | null): string {
  if (cr === null) return "—";
  const fractions: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return fractions[cr] ?? String(cr);
}

/** CR choices for the min/max filters. */
export const CR_STEPS: number[] = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
