import { describe, expect, it } from "vitest";
import { buildCards, canSeeCarousel, isBloodied, type CombatantInput } from "../src/carousel-model";

const base = (over: Partial<CombatantInput>): CombatantInput => ({
  id: "x", name: "X", img: "x.webp", initiative: 10, hero: false, hidden: false, defeated: false,
  hp: { value: 10, max: 10 }, statuses: [], ...over,
});
const goblin = base({ id: "g", name: "Goblin", initiative: 15.13, hp: { value: 4, max: 10 } });
const hero = base({ id: "h", name: "Brienne", hero: true, initiative: 21, hp: { value: 18, max: 26 } });
const lurker = base({ id: "l", name: "Lurker", hidden: true });

describe("canSeeCarousel", () => {
  const gm = { isGM: true, isTable: false }, player = { isGM: false, isTable: false }, table = { isGM: false, isTable: true };
  it("shows everyone by default", () => {
    expect([gm, player, table].map(v => canSeeCarousel("everyone", v))).toEqual([true, true, true]);
  });
  it("keeps it off the table display", () => {
    expect([gm, player, table].map(v => canSeeCarousel("players", v))).toEqual([true, true, false]);
  });
  it("can be GM only", () => {
    expect([gm, player, table].map(v => canSeeCarousel("gm", v))).toEqual([true, false, false]);
  });
});

describe("buildCards", () => {
  it("gives the GM every number", () => {
    const [g, h] = buildCards([goblin, hero], "g", true);
    expect(g).toMatchObject({ current: true, init: "15", hp: { text: "4/10", pct: 40, low: true }, bloodied: false });
    expect(h).toMatchObject({ current: false, init: "21", hp: { text: "18/26", low: false } });
  });

  it("hides monster numbers from players and shows Bloodied instead", () => {
    const [g, h] = buildCards([goblin, hero], null, false);
    expect(g).toMatchObject({ init: null, hp: null, bloodied: true });
    expect(h).toMatchObject({ init: "21", hp: { text: "18/26" }, bloodied: false });
  });

  it("drops hidden combatants for players and marks them for the GM", () => {
    expect(buildCards([goblin, lurker], null, false).map(c => c.id)).toEqual(["g"]);
    expect(buildCards([goblin, lurker], null, true).find(c => c.id === "l")?.secret).toBe(true);
  });

  it("shows no HP or Bloodied on a defeated card", () => {
    const dead = base({ id: "d", defeated: true, hp: { value: 0, max: 10 } });
    expect(buildCards([dead], null, true)[0]).toMatchObject({ hp: null, bloodied: false, defeated: true });
    expect(buildCards([dead], null, false)[0]).toMatchObject({ hp: null, bloodied: false });
  });

  it("caps statuses and counts the rest", () => {
    const s = (n: string) => ({ img: `systems/dnd5e/icons/svg/statuses/${n}.svg`, name: n });
    const busy = base({ statuses: ["prone", "frightened", "stunned", "poisoned", "blinded"].map(s) });
    const [card] = buildCards([busy], null, true, 4);
    expect(card.statuses.map(x => x.name)).toEqual(["prone", "frightened", "stunned"]);
    expect(card.more).toBe(2);
    expect(card.statuses[0].svg).toBe(true);
    expect(buildCards([base({ statuses: [{ img: "icons/bless.webp", name: "Bless" }] })], null, true)[0].statuses[0].svg).toBe(false);
  });
});

describe("isBloodied", () => {
  it("is half or less, and above zero", () => {
    expect([isBloodied(5, 10), isBloodied(6, 10), isBloodied(0, 10), isBloodied(3, 0)]).toEqual([true, false, false, false]);
  });
});
