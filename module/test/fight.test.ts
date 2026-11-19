import { describe, expect, it } from "vitest";
import { hasMargin, inMargin, mainEncounterOf, marginSlots, parseHp, rollNow, splitXp, summarizeFight, tokenNames, type SceneArea } from "../src/fight";

// A 10×8 cell canvas (100px cells) with a 2-cell margin all round: the background is cells 2–7 × 2–5.
const area: SceneArea = { width: 1000, height: 800, size: 100, sceneRect: { x: 200, y: 200, width: 600, height: 400 } };

describe("hasMargin", () => {
  it("is true with padding and false without", () => {
    expect(hasMargin(area)).toBe(true);
    expect(hasMargin({ ...area, sceneRect: { x: 0, y: 0, width: 1000, height: 800 } })).toBe(false);
  });
});

describe("marginSlots", () => {
  it("hugs the map: the ring right beside the background fills first, top row left to right", () => {
    expect(marginSlots(area, [], [{ width: 1, height: 1 }, { width: 1, height: 1 }])).toEqual([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
  });

  it("goes round the ring before moving further out", () => {
    // The ring next to a 6×4 background is 8×6 cells minus the middle: 24 cells, none of them in the outer ring.
    const ring = marginSlots(area, [], Array(24).fill({ width: 1, height: 1 }))!;
    expect(ring.every(p => p.x >= 100 && p.x <= 800 && p.y >= 100 && p.y <= 600)).toBe(true);
    const next = marginSlots(area, [], Array(25).fill({ width: 1, height: 1 }))!;
    expect(next[24]).toEqual({ x: 0, y: 0 });
  });

  it("skips existing tokens and never touches the background", () => {
    const slots = marginSlots(area, [{ x: 100, y: 100, width: 100, height: 100 }], [{ width: 1, height: 1 }])!;
    expect(slots).toEqual([{ x: 200, y: 100 }]);
    // Fill every margin cell (10×8 = 80 cells, 6×4 = 24 background) and nothing lands on the background.
    const all = marginSlots(area, [], Array(56).fill({ width: 1, height: 1 }))!;
    expect(all).toHaveLength(56);
    expect(all.every(p => p.x < 200 || p.x >= 800 || p.y < 200 || p.y >= 600)).toBe(true);
  });

  it("fits large creatures in cells that have room", () => {
    const [big] = marginSlots(area, [], [{ width: 2, height: 2 }])!;
    // Touching the background's top-left corner is the first spot with no gap.
    expect(big).toEqual({ x: 0, y: 0 });
  });

  it("knows when a token is in the Margin", () => {
    expect(inMargin({ x: 100, y: 100, width: 100, height: 100 }, area.sceneRect)).toBe(true);
    expect(inMargin({ x: 150, y: 150, width: 100, height: 100 }, area.sceneRect)).toBe(false);
  });

  it("returns null when they don't all fit", () => {
    expect(marginSlots(area, [], Array(57).fill({ width: 1, height: 1 }))).toBeNull();
    expect(marginSlots(area, [], [{ width: 3, height: 3 }])).toBeNull();
  });
});

describe("tokenNames", () => {
  it("keeps a lone creature's name", () => expect(tokenNames("Ogre", 0, 1)).toEqual(["Ogre"]));
  it("numbers a group", () => expect(tokenNames("Goblin", 0, 3)).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]));
  it("continues numbering for reinforcements", () => expect(tokenNames("Goblin", 4, 2)).toEqual(["Goblin 5", "Goblin 6"]));
});

describe("splitXp", () => {
  it("splits evenly and rounds down", () => expect(splitXp(450, 4)).toBe(112));
  it("gives nothing with nobody present", () => expect(splitXp(450, 0)).toBe(0));
});

describe("parseHp", () => {
  it("reads damage, healing and a new value", () => {
    expect(parseHp("-7")).toEqual({ value: -7, isDelta: true });
    expect(parseHp(" +5 ")).toEqual({ value: 5, isDelta: true });
    expect(parseHp("12")).toEqual({ value: 12, isDelta: false });
    expect(parseHp("=12")).toEqual({ value: 12, isDelta: false });
  });
  it("rejects anything else", () => {
    expect(parseHp("")).toBeNull();
    expect(parseHp("abc")).toBeNull();
    expect(parseHp("-")).toBeNull();
  });
});

describe("summarizeFight", () => {
  const ambush = { encounterId: "a", name: "Goblin Ambush", xp: 1000 };
  const wolves = { encounterId: "w", name: "Wolf Pack", xp: 150, kind: "import" as const };
  const ogre = { encounterId: "a", name: "Ogre", xp: 450, kind: "added" as const };

  it("names the first Encounter, then reinforcements and added monsters, with the fight's total XP", () => {
    expect(summarizeFight([ambush, wolves, ogre, { ...ambush }])).toEqual({
      encounterId: "a", name: "Goblin Ambush", xp: 2600,
      lines: [
        { encounterId: "w", name: "Wolf Pack", note: "reinforcements" },
        { encounterId: "a", name: "Ogre", note: "added" },
        { encounterId: "a", name: "Goblin Ambush", note: "reinforcements" },
      ],
    });
  });
  it("is null for a fight with no Import", () => {
    expect(summarizeFight([])).toBeNull();
  });
  it("sends a dropped monster to the Encounter the fight started with", () => {
    expect(mainEncounterOf([ambush, wolves])).toBe("a");
    expect(mainEncounterOf([])).toBeNull();
  });
});

describe("rollNow", () => {
  const joined = [
    { id: "goblin", isNPC: true, initiative: null },
    { id: "rolled", isNPC: true, initiative: 14 },
    { id: "pc", isNPC: false, initiative: null },
  ];
  it("rolls for monsters without initiative once the fight has started", () => {
    expect(rollNow(true, joined)).toEqual(["goblin"]);
  });
  it("leaves it to the GM before round 1", () => {
    expect(rollNow(false, joined)).toEqual([]);
  });
});
