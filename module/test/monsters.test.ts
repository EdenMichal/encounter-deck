import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, filterMonsters, formatCr, monsterFromIndex, parseCr, type Monster } from "../src/monsters";

const xp = (cr: number | null) => (cr === null ? 0 : cr * 100);
const goblin: Monster = { uuid: "a", name: "Goblin Warrior", img: "", cr: 0.25, xp: 50, type: "fey", size: "sm", habitats: ["forest"], pack: "p" };
const ogre: Monster = { uuid: "b", name: "Ogre", img: "", cr: 2, xp: 450, type: "giant", size: "lg", habitats: ["hill", "forest"], pack: "p" };
const rat: Monster = { uuid: "c", name: "Rat", img: "", cr: 0, xp: 10, type: "beast", size: "tiny", habitats: ["any"], pack: "p" };
const all = [goblin, ogre, rat];

describe("monsterFromIndex", () => {
  it("reads a dnd5e NPC index entry", () => {
    const m = monsterFromIndex({ _id: "x", type: "npc", name: "Ogre", img: "o.webp",
      system: { details: { cr: 2, type: { value: "giant" }, habitat: { value: [{ type: "hill" }] } }, traits: { size: "lg" } } }, "world.mon", xp);
    expect(m).toEqual({ uuid: "Compendium.world.mon.Actor.x", name: "Ogre", img: "o.webp", cr: 2, xp: 200, type: "giant", size: "lg", habitats: ["hill"], pack: "world.mon" });
  });
  it("skips anything that isn't an NPC", () => {
    expect(monsterFromIndex({ type: "character" }, "p", xp)).toBeNull();
    expect(monsterFromIndex({ type: "encounter" }, "p", xp)).toBeNull();
  });
});

describe("filterMonsters", () => {
  it("matches every word of the name", () => {
    expect(filterMonsters(all, { ...EMPTY_FILTER, name: "war gob" })).toEqual([goblin]);
  });
  it("filters a CR range", () => {
    expect(filterMonsters(all, { ...EMPTY_FILTER, crMin: 0.25, crMax: 1 })).toEqual([goblin]);
    expect(filterMonsters(all, { ...EMPTY_FILTER, crMax: 0 })).toEqual([rat]);
  });
  it("filters type and size", () => {
    expect(filterMonsters(all, { ...EMPTY_FILTER, type: "giant" })).toEqual([ogre]);
    expect(filterMonsters(all, { ...EMPTY_FILTER, size: "sm" })).toEqual([goblin]);
  });
  it("treats an 'any' habitat as matching every habitat", () => {
    expect(filterMonsters(all, { ...EMPTY_FILTER, habitat: "hill" })).toEqual([ogre, rat]);
  });
});

describe("CR formatting", () => {
  it("round-trips fractions", () => {
    expect(parseCr("1/4")).toBe(0.25);
    expect(formatCr(0.125)).toBe("1/8");
    expect(formatCr(5)).toBe("5");
  });
});
