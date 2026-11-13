import { describe, expect, it } from "vitest";
import { addEntry, changeCount, readEntries, removeEntry, swapEntry, toSource, totalXp } from "../src/entries";

const goblin = { uuid: "Compendium.a.Actor.g", name: "Goblin", img: "g", cr: 0.25, xp: 50 };
const ogre = { uuid: "Compendium.a.Actor.o", name: "Ogre", img: "o", cr: 2, xp: 450 };
const live = new Map([[goblin.uuid, goblin], [ogre.uuid, ogre]]);
const lookup = (uuid: string) => live.get(uuid) ?? null;

describe("readEntries", () => {
  it("marks a row missing and keeps its saved name and CR", () => {
    const gone = { uuid: "Compendium.gone.Actor.x", name: "Owlbear", img: "", cr: 3, xp: 700 };
    const entries = readEntries(
      [{ uuid: goblin.uuid, quantity: { value: 4 } }, { uuid: gone.uuid, quantity: { value: 1 } }],
      [goblin, gone], lookup);
    expect(entries.map(e => [e.name, e.count, e.missing])).toEqual([["Goblin", 4, false], ["Owlbear", 1, true]]);
    expect(totalXp(entries)).toBe(900);
  });
});

describe("editing", () => {
  it("adds, merges, counts and removes", () => {
    let e = addEntry([], goblin);
    e = addEntry(e, goblin, 2);
    e = addEntry(e, ogre);
    expect(e.map(x => x.count)).toEqual([3, 1]);
    e = changeCount(e, ogre.uuid, -5);
    expect(e[1].count).toBe(1);
    e = removeEntry(e, goblin.uuid);
    expect(e.map(x => x.name)).toEqual(["Ogre"]);
  });
  it("swaps a missing row in place, keeping its count", () => {
    const gone = { uuid: "Compendium.gone.Actor.x", name: "Owlbear", img: "", cr: 3, xp: 700, count: 2, missing: true };
    const e = swapEntry([gone, { ...goblin, count: 1, missing: false }], gone.uuid, ogre);
    expect(e.map(x => [x.name, x.count, x.missing])).toEqual([["Ogre", 2, false], ["Goblin", 1, false]]);
  });
  it("writes dnd5e members plus the saved copies", () => {
    const { members, cache } = toSource([{ ...goblin, count: 3, missing: false }]);
    expect(members).toEqual([{ uuid: goblin.uuid, quantity: { value: 3 } }]);
    expect(cache).toEqual([goblin]);
  });
});
