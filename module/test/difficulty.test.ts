import { describe, expect, it } from "vitest";
import { bandOf, crToXp, meter, partyBudget } from "../src/difficulty";

// dnd5e 5.3.2's CONFIG.DND5E.ENCOUNTER_DIFFICULTY rows 0-5 and CR_EXP_LEVELS start.
const TABLE = [[0, 0, 0], [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100]];
const CR_XP = [10, 200, 450, 700, 1100, 1800];

describe("partyBudget", () => {
  it("sums each character's own level", () => {
    expect(partyBudget([3, 3, 3, 3], TABLE)).toEqual({ low: 600, moderate: 900, high: 1600 });
    expect(partyBudget([1, 5], TABLE)).toEqual({ low: 550, moderate: 825, high: 1200 });
  });
  it("clamps levels into the table", () => {
    expect(partyBudget([0], TABLE)).toEqual({ low: 0, moderate: 0, high: 0 });
    expect(partyBudget([99], TABLE)).toEqual({ low: 500, moderate: 750, high: 1100 });
  });
});

describe("crToXp", () => {
  it("matches dnd5e's getCRExp", () => {
    expect(crToXp(0, CR_XP)).toBe(10);
    expect(crToXp(0.25, CR_XP)).toBe(50);
    expect(crToXp(0.5, CR_XP)).toBe(100);
    expect(crToXp(3, CR_XP)).toBe(700);
    expect(crToXp(null, CR_XP)).toBe(0);
  });
});

describe("bandOf", () => {
  const budget = { low: 600, moderate: 900, high: 1600 };
  it("rates against the thresholds", () => {
    expect(bandOf(0, budget)).toBe("empty");
    expect(bandOf(600, budget)).toBe("low");
    expect(bandOf(601, budget)).toBe("moderate");
    expect(bandOf(1600, budget)).toBe("high");
    expect(bandOf(1601, budget)).toBe("over");
  });
  it("needs present PCs", () => {
    expect(bandOf(500, { low: 0, moderate: 0, high: 0 })).toBe("noParty");
  });
  it("places the stops on a bar that runs to 125% of High", () => {
    const m = meter(1000, { low: 500, moderate: 750, high: 1000 });
    expect(m.stops).toEqual({ low: 40, moderate: 60, high: 80 });
    expect(m.pct).toBe(80);
  });
});
