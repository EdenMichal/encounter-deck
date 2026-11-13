/**
 * The 2024 encounter difficulty math (DMG 2024: "XP Budget per Character"). Pure, so it can be tested
 * without Foundry; callers pass dnd5e's own tables (CONFIG.DND5E.ENCOUNTER_DIFFICULTY, CR_EXP_LEVELS).
 */
export interface Budget { low: number; moderate: number; high: number }
export type Band = "empty" | "noParty" | "low" | "moderate" | "high" | "over";

export const BAND_LABELS: Record<Band, string> = {
  empty: "No creatures",
  noParty: "No present PCs",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  over: "Beyond High",
};

/** Sum each present character's budget for their own level. */
export function partyBudget(levels: number[], table: number[][]): Budget {
  return levels.reduce<Budget>((b, level) => {
    const row = table[Math.max(0, Math.min(level || 0, table.length - 1))] ?? [0, 0, 0];
    return { low: b.low + row[0], moderate: b.moderate + row[1], high: b.high + row[2] };
  }, { low: 0, moderate: 0, high: 0 });
}

/** XP for one creature of a CR, the same way dnd5e's Actor5e#getCRExp works. */
export function crToXp(cr: number | null | undefined, table: number[]): number {
  if (cr === null || cr === undefined || !Number.isFinite(cr)) return 0;
  if (cr < 1) return Math.max(200 * cr, 10);
  return table[cr] ?? table[table.length - 1] ?? 0;
}

export function bandOf(xp: number, budget: Budget): Band {
  if (!budget.high) return "noParty";
  if (xp <= 0) return "empty";
  if (xp <= budget.low) return "low";
  if (xp <= budget.moderate) return "moderate";
  if (xp <= budget.high) return "high";
  return "over";
}

export interface Meter {
  xp: number;
  band: Band;
  label: string;
  budget: Budget;
  /** Fill and threshold marks, as percentages of the bar. The bar runs to 125% of the High budget. */
  pct: number;
  stops: { low: number; moderate: number; high: number };
}

export function meter(xp: number, budget: Budget): Meter {
  const band = bandOf(xp, budget);
  const scale = budget.high * 1.25;
  const pc = (n: number) => (scale ? Math.min(100, (n / scale) * 100) : 0);
  return {
    xp, band, label: BAND_LABELS[band], budget,
    pct: pc(xp),
    stops: { low: pc(budget.low), moderate: pc(budget.moderate), high: pc(budget.high) },
  };
}
