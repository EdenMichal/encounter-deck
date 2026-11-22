import { describe, expect, it } from "vitest";
import {
  CHECK_HANDLER, SAVE_HANDLER, buildEntries, clampPosition, parseDc, parseRollChoice, partyState, requestMessageData,
  rollGroups, spellDcOf, startPosition, statToggles, type MemberInput,
} from "../src/party-bar-model";

const pc = (over: Partial<MemberInput> = {}): MemberInput => ({
  id: "a", name: "Brienne", img: "b.webp", ac: 18, passives: { prc: 14, inv: 10, ins: 12 },
  hp: { value: 20, max: 30, temp: 0, tempmax: 0 }, spellDc: null, inspiration: false, ...over,
});
const allOn = statToggles({});

describe("statToggles", () => {
  it("switches every stat on unless saved off", () => {
    expect(Object.values(statToggles(undefined)).every(Boolean)).toBe(true);
    expect(statToggles({ ins: false, dc: false })).toMatchObject({ ac: true, ins: false, dc: false, inspiration: true });
  });
});

describe("spellDcOf", () => {
  const base = { ability: "", classAbilities: [] as string[], spells: 0, dc: 12, dcs: { int: 15, wis: 13 } };
  it("gives no DC to a PC who doesn't cast, though dnd5e works one out", () => {
    expect(spellDcOf(base)).toBeNull();
    expect(spellDcOf({ ...base, ability: "int" })).toBeNull();
    expect(spellDcOf({ ...base, spells: 2 })).toBeNull();
  });
  it("uses the sheet's DC for a class caster or a PC with spells and a spellcasting ability", () => {
    expect(spellDcOf({ ...base, ability: "int", classAbilities: ["int"], dc: 15 })).toBe(15);
    expect(spellDcOf({ ...base, ability: "wis", spells: 1, dc: 13 })).toBe(13);
  });
  it("falls back to the class's ability when the sheet has none picked", () => {
    expect(spellDcOf({ ...base, classAbilities: ["int"], dc: 10 })).toBe(15);
  });
});

describe("buildEntries", () => {
  it("lists the switched-on stats that have a value, with text labels", () => {
    const [entry] = buildEntries([pc({ spellDc: 15 })], allOn);
    expect(entry.stats.map(s => [s.key, s.value])).toEqual([["ac", "18"], ["prc", "14"], ["inv", "10"], ["ins", "12"], ["dc", "15"]]);
    expect(entry.stats.find(s => s.key === "prc")?.label).toBe("Passive Perception 14");
    expect(entry.stats.find(s => s.key === "dc")?.label).toBe("Spell save DC 15");
  });
  it("leaves out switched-off stats, a non-caster's DC, the HP bar and Inspiration", () => {
    const [entry] = buildEntries([pc()], statToggles({ inv: false, hp: false, inspiration: false }));
    expect(entry.stats.map(s => s.key)).toEqual(["ac", "prc", "ins"]);
    expect(entry.hp).toBeNull();
    expect(entry.inspiration).toBeNull();
  });
  it("shows Inspiration as on or off while switched on", () => {
    expect(buildEntries([pc({ inspiration: true })], allOn)[0].inspiration).toBe(true);
    expect(buildEntries([pc()], allOn)[0].inspiration).toBe(false);
  });
  it("puts HP, temp HP and a changed maximum in the bar's tooltip", () => {
    const [entry] = buildEntries([pc({ hp: { value: 12, max: 30, temp: 5, tempmax: -6 } })], allOn);
    expect(entry.hp).toEqual({ pct: 50, tempPct: 21, low: true, down: false, text: "HP 12/24, 5 temp (max -6)" });
    expect(buildEntries([pc({ hp: { value: 0, max: 30, temp: 0, tempmax: 0 } })], allOn)[0].hp).toMatchObject({ down: true, low: false });
    expect(buildEntries([pc({ hp: { value: 5, max: 0, temp: 0, tempmax: 0 } })], allOn)[0].hp).toBeNull();
  });
});

describe("partyState", () => {
  it("says why the bar is empty", () => {
    expect(partyState({ campaign: false, folder: false, members: 0, present: 0 })).toBe("noCampaign");
    expect(partyState({ campaign: true, folder: false, members: 0, present: 0 })).toBe("noFolder");
    expect(partyState({ campaign: true, folder: true, members: 0, present: 0 })).toBe("emptyFolder");
    expect(partyState({ campaign: true, folder: true, members: 3, present: 0 })).toBe("nonePresent");
    expect(partyState({ campaign: true, folder: true, members: 3, present: 2 })).toBe("ok");
  });
});

describe("position", () => {
  const size = { width: 300, height: 90 }, viewport = { width: 1600, height: 900 };
  it("keeps the bar on screen", () => {
    expect(clampPosition({ left: -40, top: 2000 }, size, viewport)).toEqual({ left: 0, top: 810 });
    expect(clampPosition({ left: 1500, top: 100 }, size, viewport)).toEqual({ left: 1300, top: 100 });
    expect(clampPosition({ left: 50, top: 50 }, { width: 2000, height: 90 }, viewport)).toEqual({ left: 0, top: 50 });
  });
  it("starts where it was dragged, then where Monk's TokenBar sat", () => {
    const players = { left: 96, top: 700 };
    expect(startPosition({ saved: { left: 40, top: 60 }, monk: { left: 15, top: 500 }, players, size, viewport })).toEqual({ left: 40, top: 60 });
    expect(startPosition({ saved: {}, monk: { left: 15, top: 500 }, players, size, viewport })).toEqual({ left: 15, top: 500 });
    // Monk's own default flag: {left: 15, right: "", top: "", bottom: 230}.
    expect(startPosition({ saved: {}, monk: { left: 15, right: "", top: "", bottom: 230 }, players, size, viewport })).toEqual({ left: 15, top: 580 });
  });
  it("otherwise sits just above the players list, or at Monk's old default", () => {
    expect(startPosition({ saved: null, monk: undefined, players: { left: 96, top: 700 }, size, viewport })).toEqual({ left: 96, top: 602 });
    expect(startPosition({ saved: null, monk: undefined, players: null, size, viewport })).toEqual({ left: 15, top: 580 });
  });
});

describe("roll requests", () => {
  it("groups skills, ability checks and saving throws, sorted by label", () => {
    const groups = rollGroups({ prc: { label: "Perception" }, acr: { label: "Acrobatics" } }, { str: { label: "Strength" }, dex: { label: "Dexterity" } });
    expect(groups.map(g => g.label)).toEqual(["Skills", "Ability checks", "Saving throws"]);
    expect(groups[0].options).toEqual([{ value: "skill:acr", label: "Acrobatics" }, { value: "skill:prc", label: "Perception" }]);
    expect(groups[2].options.map(o => o.value)).toEqual(["save:dex", "save:str"]);
  });
  it("reads the select and the DC box", () => {
    expect(parseRollChoice("save:dex")).toEqual({ kind: "save", key: "dex" });
    expect(parseRollChoice("bogus:x")).toBeNull();
    expect(parseRollChoice("skill:")).toBeNull();
    expect([parseDc("15"), parseDc(" 12 "), parseDc(""), parseDc("0"), parseDc("7.5"), parseDc("x")]).toEqual([15, 12, null, null, null, null]);
  });
  it("uses dnd5e's skill handler for skills, with the DC as the roll's target", () => {
    const data = requestMessageData({ choice: { kind: "skill", key: "prc" }, title: "Wisdom (Perception) Check", dc: 15, flavor: "", targets: ["Actor.a", "Actor.b"] });
    expect(data).toMatchObject({
      type: "request", flavor: "Wisdom (Perception) Check", content: "",
      system: { handler: "skill", data: { skill: "prc", target: 15 }, targets: [{ actor: "Actor.a" }, { actor: "Actor.b" }] },
    });
    expect(data.system.button.label).toBe("Wisdom (Perception) Check");
  });
  it("uses our own handlers for ability checks and saves, and escapes the flavour line", () => {
    const check = requestMessageData({ choice: { kind: "check", key: "str" }, title: "Strength Ability Check", dc: null, flavor: "", targets: ["Actor.a"] });
    expect(check.system).toMatchObject({ handler: CHECK_HANDLER, data: { ability: "str" } });
    expect("target" in check.system.data).toBe(false);
    const save = requestMessageData({ choice: { kind: "save", key: "dex" }, title: "Dexterity Saving Throw", dc: 14, flavor: " The floor <gives> way ", targets: ["Actor.a"] });
    expect(save.system).toMatchObject({ handler: SAVE_HANDLER, data: { ability: "dex", target: 14 } });
    expect(save.content).toBe("<p>The floor &lt;gives&gt; way</p>");
  });
});
