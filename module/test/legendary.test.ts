import { describe, expect, it } from "vitest";
import { lairDelta, legendaryActions, legendaryOf, resistanceOf, pips, promptRows, rechargeAbilities, rechargeLabel, type PromptCandidate } from "../src/legendary";

const act = (id: string, type: string, value: number | null = null, name = "") => ({ id, name, activation: { type, value } });
const dragonItems = [
  { id: "bite", name: "Bite", img: "b.webp", system: { activities: [act("a1", "action")] } },
  { id: "wing", name: "Wing Attack", img: "w.webp", system: { activities: [act("a2", "legendary", 2)] } },
  { id: "tail", name: "Tail Attack", img: "t.webp", system: { activities: [act("a3", "legendary", 1)] } },
  { id: "detect", name: "Detect", img: "d.webp", system: { activities: [act("a4", "legendary", 1)] } },
  { id: "breath", name: "Fire Breath", img: "f.webp", system: { uses: { max: 1, spent: 1, recovery: [{ period: "recharge", formula: "5" }] }, activities: [act("a5", "action")] } },
];

describe("legendaryOf", () => {
  it("reads uses left from dnd5e's legact", () => {
    expect(legendaryOf({ resources: { legact: { max: 3, spent: 1, value: 2 } } })).toEqual({ value: 2, max: 3 });
    expect(legendaryOf({ resources: { legact: { max: 4, spent: 1 } } })).toEqual({ value: 3, max: 4 });
  });
  it("is null for a monster without legendary actions", () => {
    expect(legendaryOf({ resources: { legact: { max: 0, spent: 0 } } })).toBeNull();
    expect(legendaryOf({})).toBeNull();
  });
});

describe("resistanceOf", () => {
  it("reads legendary resistances left from dnd5e's legres", () => {
    expect(resistanceOf({ resources: { legres: { max: 4, spent: 1, value: 3 } } })).toEqual({ value: 3, max: 4 });
    expect(resistanceOf({ resources: { legres: { max: 0, spent: 0 } } })).toBeNull();
  });
});

describe("legendaryActions", () => {
  it("lists legendary activities, cheapest first, with their cost", () => {
    expect(legendaryActions(dragonItems).map(a => [a.name, a.cost, a.itemId, a.activityId])).toEqual([
      ["Detect", 1, "detect", "a4"], ["Tail Attack", 1, "tail", "a3"], ["Wing Attack", 2, "wing", "a2"],
    ]);
  });
  it("leaves out spells a feature casts, as dnd5e's sheet does", () => {
    const cast = { id: "c", name: "Commanding Presence", img: "", system: { activities: [act("k", "legendary", 1)] } };
    const cached = { id: "s", name: "Command", img: "", flags: { dnd5e: { cachedFor: ".Item.c.Activity.k" } }, system: { activities: [act("q", "legendary", 1)] } };
    expect(legendaryActions([cast, cached]).map(a => a.name)).toEqual(["Commanding Presence"]);
  });
  it("names each activity when an item has several, and counts a missing cost as 1", () => {
    const item = { id: "i", name: "Lair Shift", img: "", system: { activities: [act("x", "legendary", null, "Push"), act("y", "mythic", 3, "Pull")] } };
    expect(legendaryActions([item]).map(a => [a.name, a.cost])).toEqual([["Lair Shift: Push", 1], ["Lair Shift: Pull", 3]]);
  });
});

describe("recharge", () => {
  it("prints a recharge the way the books do", () => {
    expect(rechargeLabel("5")).toBe("5–6");
    expect(rechargeLabel(4)).toBe("4–6");
    expect(rechargeLabel("6")).toBe("6");
  });
  it("lists recharge abilities and whether they are ready", () => {
    expect(rechargeAbilities(dragonItems)).toEqual([{ name: "Fire Breath", ready: false, label: "5–6" }]);
    const fresh = { id: "g", name: "Poison Breath", system: { uses: { max: 1, spent: 0, recovery: [{ period: "recharge", formula: "6" }] }, activities: [] } };
    expect(rechargeAbilities([fresh])).toEqual([{ name: "Poison Breath", ready: true, label: "6" }]);
  });
  it("finds a recharge on an activity of an item that has none itself", () => {
    const item = { id: "s", name: "Spores", system: { uses: { max: 0, recovery: [] }, activities: [{ id: "z", name: "Cloud", uses: { max: 1, spent: 0, recovery: [{ period: "recharge", formula: "5" }] } }] } };
    expect(rechargeAbilities([item])).toEqual([{ name: "Spores: Cloud", ready: true, label: "5–6" }]);
  });
});

describe("promptRows", () => {
  const actions = legendaryActions(dragonItems);
  const c = (id: string, over: Partial<PromptCandidate> = {}): PromptCandidate =>
    ({ id, name: id, img: "", defeated: false, legendary: { value: 1, max: 3 }, actions, ...over });

  it("lists legendary monsters except the one whose turn just ended", () => {
    const rows = promptRows([c("red"), c("blue"), c("goblin", { legendary: null })], "red");
    expect(rows.map(r => r.id)).toEqual(["blue"]);
  });
  it("skips the defeated and those with no uses left", () => {
    expect(promptRows([c("a", { defeated: true }), c("b", { legendary: { value: 0, max: 3 } })], null)).toEqual([]);
  });
  it("marks actions that cost more than what's left", () => {
    const [row] = promptRows([c("red")], null);
    expect(row.pips).toEqual([true, false, false]);
    expect(row.actions.map(a => [a.name, a.usable])).toEqual([["Detect", true], ["Tail Attack", true], ["Wing Attack", false]]);
  });
});

describe("pips", () => {
  it("fills one per use left", () => expect(pips({ value: 2, max: 4 })).toEqual([true, true, false, false]));
});

describe("lairDelta", () => {
  it("puts a monster with a lair inside it when the Encounter is in its lair", () => {
    expect(lairDelta(true, true)).toEqual({ system: { resources: { lair: { inside: true } } } });
    expect(lairDelta(true, false)).toBeNull();
    expect(lairDelta(false, true)).toBeNull();
  });
});
