import { describe, expect, it } from "vitest";
import { addCoins, cleanCoins, coinText, collectLoot, itemToGive, shareText, splitCoins, stackTarget, takeTurns } from "../src/loot";

const sword = { id: "Compendium.x.Item.sword", name: "Longsword", img: "s.webp", data: { name: "Longsword", type: "weapon", system: { quantity: 1, equipped: true } } };
const arrows = { id: "arrows", name: "Arrows", img: "a.webp", data: { name: "Arrows", type: "consumable", system: { quantity: 20 } } };

describe("collectLoot", () => {
  it("multiplies TokenBar's count by each stack, merges the same item across monsters, and drops zeros", () => {
    const loot = collectLoot([
      { items: [{ ...sword, quantity: 2 }, { ...arrows, quantity: 1 }] },
      { items: [{ ...sword, quantity: "1" }, { ...arrows, quantity: 0 }] },
    ]);
    expect(loot.map(l => [l.name, l.quantity])).toEqual([["Arrows", 20], ["Longsword", 3]]);
  });
});

describe("coins", () => {
  it("cleans TokenBar's currency into whole coins", () => {
    expect(cleanCoins({ pp: 0, gp: "84", ep: "x", sp: 12.7, cp: -3 })).toEqual({ gp: 84, sp: 12 });
  });
  it("splits each coin evenly and keeps the leftover", () => {
    expect(splitCoins({ gp: 84, sp: 13, cp: 2 }, 3)).toEqual({ each: { gp: 28, sp: 4 }, leftover: { sp: 1, cp: 2 } });
  });
  it("leaves everything over when there's nobody", () => {
    expect(splitCoins({ gp: 5 }, 0)).toEqual({ each: {}, leftover: { gp: 5 } });
  });
  it("writes coins the way the books do, and adds them to a purse", () => {
    expect(coinText({ sp: 4, gp: 28 })).toBe("28 gp, 4 sp");
    expect(addCoins({ gp: 10, sp: 0 }, { gp: 28, sp: 4 })).toEqual({ gp: 38, sp: 4 });
  });
});

describe("takeTurns", () => {
  it("hands items out in turn, first item to the first PC", () => {
    const items = collectLoot([{ items: [{ ...sword, quantity: 1 }, { ...arrows, quantity: 1 }, { id: "p", name: "Potion", img: "", quantity: 1, data: {} }] }]);
    expect(Object.values(takeTurns(items, ["a", "b"]))).toEqual(["a", "b", "a"]);
    expect(takeTurns(items, [])).toEqual({});
  });
});

describe("itemToGive", () => {
  it("gives the whole stack, unequipped, without the old id", () => {
    const given = itemToGive({ _id: "old", ...sword.data }, 3);
    expect(given).toEqual({ name: "Longsword", type: "weapon", system: { quantity: 3, equipped: false } });
    expect(sword.data.system.equipped).toBe(true);
  });
});

describe("stackTarget", () => {
  it("stacks onto the same item from the same source", () => {
    const have = [{ name: "Arrows", type: "consumable", system: { quantity: 5 }, _stats: { compendiumSource: "A" } }];
    expect(stackTarget(have, { name: "Arrows", type: "consumable", _stats: { compendiumSource: "A" } })).toBe(have[0]);
    expect(stackTarget(have, { name: "Arrows", type: "consumable", _stats: { compendiumSource: "B" } })).toBeNull();
    expect(stackTarget(have, { name: "Arrows", type: "weapon" })).toBeNull();
  });
});

describe("shareText", () => {
  it("says who got what", () => {
    expect(shareText("Brienne", [{ name: "Longsword", quantity: 1 }, { name: "Arrows", quantity: 20 }], { gp: 28 })).toBe("Brienne: Longsword, 20× Arrows; 28 gp");
    expect(shareText("Mira", [], { gp: 28, sp: 4 })).toBe("Mira: 28 gp, 4 sp");
    expect(shareText("Aldric", [], {})).toBe("Aldric: nothing");
  });
});
