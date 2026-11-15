import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in Actor compendium whose index arrives when the test says so. */
function fakePack(id: string, names: string[]) {
  let release!: () => void;
  const ready = new Promise<void>(r => { release = r; });
  return {
    pack: {
      documentName: "Actor",
      collection: id,
      metadata: { label: id, flags: {} },
      getIndex: async () => { await ready; return names.map((name, i) => ({ _id: `${id}${i}`, name, type: "npc", system: { details: { cr: 1 } } })); },
    },
    release,
  };
}

describe("loadMonsters", () => {
  let config: Record<string, boolean>;
  let packs: any[];

  beforeEach(() => {
    vi.resetModules();
    config = {};
    packs = [];
    vi.stubGlobal("game", {
      settings: { get: () => config },
      packs: { filter: (fn: (p: any) => boolean) => packs.filter(fn) },
    });
    vi.stubGlobal("CONFIG", { DND5E: { CR_EXP_LEVELS: [10, 200, 450] } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the monsters of the packs switched on, once", async () => {
    const { loadMonsters, cachedMonsters } = await import("../src/sources");
    const a = fakePack("world.a", ["Goblin"]);
    packs = [a.pack];
    a.release();
    const first = await loadMonsters();
    expect(first.map(m => m.name)).toEqual(["Goblin"]);
    expect(await loadMonsters()).toBe(first);
    expect(cachedMonsters()).toBe(first);
  });

  it("doesn't keep a list that was loading when the Sources changed", async () => {
    const { loadMonsters, invalidateMonsters, cachedMonsters } = await import("../src/sources");
    const a = fakePack("world.a", ["Goblin"]);
    const b = fakePack("world.b", ["Orc"]);
    packs = [a.pack, b.pack];
    const stale = loadMonsters();

    // The GM switches pack A off while A's index is still loading.
    config = { "world.a": false };
    invalidateMonsters();
    const fresh = loadMonsters();

    a.release();
    b.release();
    expect((await fresh).map(m => m.name)).toEqual(["Orc"]);
    expect((await stale).map(m => m.name)).toEqual(["Orc"]);
    expect(cachedMonsters()?.map(m => m.name)).toEqual(["Orc"]);
  });
});
