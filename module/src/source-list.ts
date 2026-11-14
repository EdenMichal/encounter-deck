/**
 * The Sources dialog and the Builder's source tags. Pure: sources.ts feeds it compendium summaries and index entries.
 *
 * Only compendiums that hold monsters (NPCs) are Sources. The on/off state still lives in dnd5e's world-wide
 * Compendium Browser checklist (ADR 0003), where a pack is on unless it is switched off.
 */

export type PackageType = "system" | "module" | "world";
export type SourceConfig = Record<string, boolean>;

export interface PackSummary {
  id: string;
  label: string;
  packageType: PackageType;
  packageName: string;
  packageTitle: string;
  /** The pack's own source book (dnd5e's `flags.dnd5e.sourceBook`, e.g. "SRD 5.1"), when it sets one. */
  sourceBook: string;
  /** How many NPCs it holds. */
  monsters: number;
  /** The rules versions its NPCs say they use ("2014", "2024"), sorted. */
  rules: string[];
}

export interface SourceRow extends PackSummary { on: boolean }
export interface SourceGroup { key: string; title: string; packs: SourceRow[]; on: number }

export const isOn = (config: SourceConfig, id: string): boolean => config[id] !== false;

const ORDER: Record<PackageType, number> = { system: 0, module: 1, world: 2 };

/** Packs with monsters, grouped by the system, module or world they come from (system first, this world last). */
export function sourceGroups(packs: PackSummary[], config: SourceConfig): SourceGroup[] {
  const groups = new Map<string, SourceGroup & { type: PackageType }>();
  for (const p of packs) {
    if (p.monsters <= 0) continue;
    const key = `${p.packageType}:${p.packageName}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, title: p.packageTitle || p.packageName, type: p.packageType, packs: [], on: 0 }));
    const on = isOn(config, p.id);
    g.packs.push({ ...p, on });
    if (on) g.on++;
  }
  return [...groups.values()]
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.title.localeCompare(b.title))
    .map(({ type: _type, ...g }) => ({ ...g, packs: g.packs.sort((a, b) => a.label.localeCompare(b.label)) }));
}

/** dnd5e's checklist with these packs switched on or off, everything else kept as it was. */
export function toggled(config: SourceConfig, ids: string[], on: boolean): SourceConfig {
  const next = { ...config };
  for (const id of ids) next[id] = on;
  return next;
}

/** One NPC index entry's contribution to its pack's summary. */
export function countEntry(summary: Pick<PackSummary, "monsters" | "rules">, entry: any): void {
  if (entry?.type !== "npc") return;
  summary.monsters++;
  const rules = entry.system?.source?.rules;
  if (rules && !summary.rules.includes(String(rules))) summary.rules = [...summary.rules, String(rules)].sort();
}

/**
 * Where a monster comes from, short enough for a result row: its own book (set by DDB Importer and the
 * like), else its pack's source book, else the pack's name, plus the rules year when the book doesn't
 * already say it. "SRD 5.1 · 2014", "Monster Manual 2024", "JB2A DnD5e Actors".
 */
export function sourceTag(entry: any, pack: { sourceBook?: string; label?: string; id?: string }): string {
  const book = String(entry?.system?.source?.book ?? "").trim() || pack.sourceBook || pack.label || pack.id || "";
  const rules = String(entry?.system?.source?.rules ?? "").trim();
  return rules && !book.includes(rules) ? `${book} · ${rules}` : book;
}

export interface SourceOption { value: string; label: string; count: number }

/** The Builder's Source filter: every tag among the loaded monsters, with how many monsters each has. */
export function sourceOptions(monsters: { source: string }[]): SourceOption[] {
  const counts = new Map<string, number>();
  for (const m of monsters) if (m.source) counts.set(m.source, (counts.get(m.source) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, label: value, count })).sort((a, b) => a.label.localeCompare(b.label));
}
