import { describe, expect, it } from "vitest";
import { countEntry, sourceGroups, sourceOptions, sourceTag, toggled, type PackSummary } from "../src/source-list";

const pack = (over: Partial<PackSummary>): PackSummary => ({
  id: "p", label: "P", packageType: "module", packageName: "m", packageTitle: "M", sourceBook: "", monsters: 1, rules: [], ...over,
});

const srd = pack({ id: "dnd5e.monsters", label: "Monsters (SRD)", packageType: "system", packageName: "dnd5e", packageTitle: "D&D 5e", monsters: 331, rules: ["2014"] });
const actors = pack({ id: "dnd5e.actors24", label: "Actors", packageType: "system", packageName: "dnd5e", packageTitle: "D&D 5e", monsters: 385, rules: ["2024"] });
const heroes = pack({ id: "dnd5e.heroes", label: "Starter Heroes", packageType: "system", packageName: "dnd5e", packageTitle: "D&D 5e", monsters: 0 });
const jb2a = pack({ id: "jb2a.actors", label: "JB2A Actors", packageName: "jb2a", packageTitle: "JB2A", monsters: 23 });
const evo = pack({ id: "ae.actors", label: "Summons", packageName: "ae", packageTitle: "Automated Evocations", monsters: 6 });
const ddb = pack({ id: "world.ddb", label: "DDB Monsters", packageType: "world", packageName: "w", packageTitle: "Test world", monsters: 12 });
const ddbEmpty = pack({ id: "world.veh", label: "DDB Vehicles", packageType: "world", packageName: "w", packageTitle: "Test world", monsters: 0 });

describe("sourceGroups", () => {
  const groups = sourceGroups([ddb, jb2a, heroes, evo, actors, ddbEmpty, srd], { "jb2a.actors": false, "dnd5e.actors24": true });

  it("keeps only packs with monsters, grouped system first, modules A-Z, this world last", () => {
    expect(groups.map(g => g.title)).toEqual(["D&D 5e", "Automated Evocations", "JB2A", "Test world"]);
    expect(groups.flatMap(g => g.packs.map(p => p.id))).toEqual(["dnd5e.actors24", "dnd5e.monsters", "ae.actors", "jb2a.actors", "world.ddb"]);
  });

  it("reads dnd5e's checklist, where a pack is on unless switched off", () => {
    expect(groups.flatMap(g => g.packs.map(p => p.on))).toEqual([true, true, true, false, true]);
    expect(groups.map(g => g.on)).toEqual([2, 1, 0, 1]);
  });
});

describe("toggled", () => {
  it("switches the given packs and keeps the rest of dnd5e's checklist", () => {
    const before = { "dnd5e.spells": false, "a": true };
    expect(toggled(before, ["a", "b"], false)).toEqual({ "dnd5e.spells": false, a: false, b: false });
    expect(before).toEqual({ "dnd5e.spells": false, a: true });
  });
});

describe("countEntry", () => {
  it("counts NPCs and collects their rules versions", () => {
    const s = { monsters: 0, rules: [] as string[] };
    for (const e of [{ type: "npc", system: { source: { rules: "2024" } } }, { type: "character" }, { type: "npc", system: { source: { rules: "2014" } } }, { type: "npc" }]) countEntry(s, e);
    expect(s).toEqual({ monsters: 3, rules: ["2014", "2024"] });
  });
});

describe("sourceTag", () => {
  it("falls back from the monster's book to the pack's book to the pack's name", () => {
    expect(sourceTag({ system: { source: { rules: "2014" } } }, { sourceBook: "SRD 5.1", label: "Monsters (SRD)" })).toBe("SRD 5.1 · 2014");
    expect(sourceTag({ system: { source: { book: "Free Rules", rules: "2024" } } }, { sourceBook: "SRD 5.2" })).toBe("Free Rules · 2024");
    expect(sourceTag({}, { label: "JB2A Actors" })).toBe("JB2A Actors");
  });
  it("doesn't repeat a year the book already names", () => {
    expect(sourceTag({ system: { source: { book: "Monster Manual 2024", rules: "2024" } } }, {})).toBe("Monster Manual 2024");
  });
});

describe("sourceOptions", () => {
  it("lists each tag once with its monster count, A-Z", () => {
    expect(sourceOptions([{ source: "SRD 5.2 · 2024" }, { source: "SRD 5.1 · 2014" }, { source: "SRD 5.2 · 2024" }, { source: "" }])).toEqual([
      { value: "SRD 5.1 · 2014", label: "SRD 5.1 · 2014", count: 1 },
      { value: "SRD 5.2 · 2024", label: "SRD 5.2 · 2024", count: 2 },
    ]);
  });
});
