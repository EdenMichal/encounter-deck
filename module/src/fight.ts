/**
 * The pure parts of running a fight: where imported tokens go in the Margin, what they're called, and how
 * Finish splits XP. No Foundry here, so it can be tested.
 */

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
/** A token's footprint in grid cells (a Large creature is 2×2). */
export interface Footprint { width: number; height: number }

export interface SceneArea {
  /** The whole canvas, background plus padding. */
  width: number;
  height: number;
  /** Grid size in pixels. */
  size: number;
  /** The background image's rectangle; everything else is Margin. */
  sceneRect: Rect;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Whether the scene has any Margin at all (padding above 0). */
export function hasMargin(area: SceneArea): boolean {
  const r = area.sceneRect;
  return r.x > 0 || r.y > 0 || r.x + r.width < area.width || r.y + r.height < area.height;
}

/**
 * Free spots in the Margin for each footprint, in order: grid-aligned, fully outside the background, inside the
 * canvas, and not on top of an existing token or of each other. Fills the top margin first, left to right.
 * Returns null when they don't all fit.
 */
export function marginSlots(area: SceneArea, occupied: Rect[], footprints: Footprint[]): Point[] | null {
  const taken = [...occupied];
  const slots: Point[] = [];
  const cols = Math.floor(area.width / area.size);
  const rows = Math.floor(area.height / area.size);
  for (const fp of footprints) {
    const w = Math.max(1, Math.ceil(fp.width)) * area.size;
    const h = Math.max(1, Math.ceil(fp.height)) * area.size;
    let found: Point | null = null;
    for (let row = 0; row < rows && !found; row++) {
      for (let col = 0; col < cols && !found; col++) {
        const rect = { x: col * area.size, y: row * area.size, width: w, height: h };
        if (rect.x + w > area.width || rect.y + h > area.height) continue;
        if (overlaps(rect, area.sceneRect)) continue;
        if (taken.some(t => overlaps(rect, t))) continue;
        found = { x: rect.x, y: rect.y };
        taken.push(rect);
      }
    }
    if (!found) return null;
    slots.push(found);
  }
  return slots;
}

/**
 * Token names for `count` new copies of a monster, when `already` of it are in the fight. A lone creature keeps its
 * plain name; otherwise numbering continues (Goblin 5, Goblin 6…).
 */
export function tokenNames(base: string, already: number, count: number): string[] {
  if (already === 0 && count === 1) return [base];
  return Array.from({ length: count }, (_, i) => `${base} ${already + i + 1}`);
}

/** Split XP evenly between the present PCs, rounding down. */
export function splitXp(total: number, people: number): number {
  if (people <= 0 || total <= 0) return 0;
  return Math.floor(total / people);
}

/**
 * What the GM typed in a tracker HP box, the way dnd5e's token HUD reads it: "-7" is 7 damage, "+5" is 5 healing,
 * "12" or "=12" sets HP to 12. Null when it isn't a number.
 */
export function parseHp(raw: string): { value: number; isDelta: boolean } | null {
  const text = raw.trim().replace(/\s+/g, "");
  const match = /^([+\-=]?)(\d+)$/.exec(text);
  if (!match) return null;
  const n = Number(match[2]);
  if (match[1] === "-") return { value: -n, isDelta: true };
  if (match[1] === "+") return { value: n, isDelta: true };
  return { value: n, isDelta: false };
}

/** What the tracker's Encounter row needs from one of the fight's Import records (see importer.ts). */
export interface FightRecord {
  encounterId: string;
  name: string;
  xp: number;
  /** "added": one monster dropped onto the tracker mid-fight (it is also saved into the Encounter). */
  kind?: "import" | "added";
}

export interface FightLine { encounterId: string; name: string; note: "reinforcements" | "added" }
export interface FightSummary { encounterId: string; name: string; xp: number; lines: FightLine[] }

/**
 * The tracker's Encounter row: the first Encounter imported into this fight, then every later Import as
 * reinforcements and every monster dropped onto the tracker as added, with the fight's total XP (what Finish awards).
 * Null for a fight Encounter Deck didn't start.
 */
export function summarizeFight(records: FightRecord[]): FightSummary | null {
  const first = records.find(r => r.kind !== "added");
  if (!first) return null;
  return {
    encounterId: first.encounterId,
    name: first.name,
    xp: records.reduce((n, r) => n + (Number(r.xp) || 0), 0),
    lines: records.filter(r => r !== first).map(r => ({
      encounterId: r.encounterId, name: r.name, note: r.kind === "added" ? "added" : "reinforcements",
    })),
  };
}

/** The Encounter a monster dropped onto the tracker joins: the one the fight started with. */
export const mainEncounterOf = (records: FightRecord[]): string | null => records.find(r => r.kind !== "added")?.encounterId ?? null;

/** The parts of a combatant `rollNow` reads. */
export interface NewCombatant { id: string; isNPC: boolean; initiative: number | null }

/**
 * Which new combatants get their initiative rolled for them: once the fight has started, every monster that joined
 * without one (dropped onto the tracker or imported as reinforcements). Before round 1 the GM rolls as usual, and PCs
 * always roll their own.
 */
export const rollNow = (started: boolean, combatants: NewCombatant[]): string[] =>
  started ? combatants.filter(c => c.isNPC && (c.initiative === null || c.initiative === undefined)).map(c => c.id) : [];
