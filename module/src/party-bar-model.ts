/**
 * The pure part of the Party Bar: which stats each Present PC shows, the spellcaster rule, where the bar sits, and
 * the dnd5e request message a roll request posts. No Foundry here, so it can be tested.
 */

/* -------------------------------------------- */
/*  Stats                                       */
/* -------------------------------------------- */

export type StatKey = "ac" | "prc" | "inv" | "ins" | "hp" | "dc" | "inspiration";

/** The GM's choice of what the bar shows, per client. Every stat is on unless switched off. */
export type StatToggles = Record<StatKey, boolean>;

export const STATS: { key: StatKey; label: string }[] = [
  { key: "ac", label: "Armor Class" },
  { key: "prc", label: "Passive Perception" },
  { key: "inv", label: "Passive Investigation" },
  { key: "ins", label: "Passive Insight" },
  { key: "hp", label: "Hit points (bar under the portrait)" },
  { key: "dc", label: "Spell save DC (spellcasters only)" },
  { key: "inspiration", label: "Inspiration" },
];

/** The saved setting, with anything missing (a stat added later) switched on. */
export function statToggles(saved: unknown): StatToggles {
  const own = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  return Object.fromEntries(STATS.map(({ key }) => [key, own[key] !== false])) as StatToggles;
}

/**
 * Whether a PC casts spells, and so gets a spell save DC on the bar: a class (or subclass) with spellcasting, or a
 * spellcasting ability picked on the sheet plus at least one spell (a racial cantrip or Magic Initiate). dnd5e works
 * out `attributes.spell.dc` for every actor, casters or not, so the DC alone can't tell.
 */
export interface CasterInput {
  /** `system.attributes.spellcasting`: the ability picked on the sheet, or "". */
  ability: string;
  /** The spellcasting ability of each class with spellcasting (`actor.spellcastingClasses`). */
  classAbilities: string[];
  /** How many spell items the PC has. */
  spells: number;
  /** `system.attributes.spell.dc`, worked out from `ability`. */
  dc: number | null;
  /** Each ability's save DC (`system.abilities.*.dc`). */
  dcs: Record<string, number>;
}

export function spellDcOf(c: CasterInput): number | null {
  if (!c.classAbilities.length && !(c.ability && c.spells > 0)) return null;
  if (c.ability && c.dc !== null) return c.dc;
  // A caster whose sheet has no spellcasting ability picked: dnd5e's DC would be 8 + proficiency, so use the class's.
  const own = c.classAbilities.find(a => Number.isFinite(c.dcs[a]));
  return own ? c.dcs[own] : c.dc;
}

/* -------------------------------------------- */
/*  Entries                                     */
/* -------------------------------------------- */

export interface MemberInput {
  id: string;
  name: string;
  img: string;
  ac: number | null;
  passives: { prc: number | null; inv: number | null; ins: number | null };
  hp: { value: number; max: number; temp: number; tempmax: number } | null;
  /** Null for a PC who doesn't cast (see spellDcOf). */
  spellDc: number | null;
  inspiration: boolean;
}

export interface StatView { key: StatKey; icon: string; value: string; label: string }

export interface EntryView {
  id: string;
  name: string;
  img: string;
  stats: StatView[];
  hp: { pct: number; tempPct: number; low: boolean; down: boolean; text: string } | null;
  /** Null when Inspiration is switched off; otherwise whether the PC has it. */
  inspiration: boolean | null;
}

const ICONS: Record<StatKey, string> = {
  ac: "fa-solid fa-shield", prc: "fa-solid fa-eye", inv: "fa-solid fa-magnifying-glass", ins: "fa-solid fa-brain",
  hp: "fa-solid fa-heart", dc: "fa-solid fa-wand-sparkles", inspiration: "fa-solid fa-star",
};
const LABELS = Object.fromEntries(STATS.map(s => [s.key, s.label])) as Record<StatKey, string>;
const SHORT: Partial<Record<StatKey, string>> = { dc: "Spell save DC" };

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** HP for the bar under the portrait: current over the maximum after any temporary change to it. */
function hpView(hp: MemberInput["hp"]) {
  if (!hp || !finite(hp.max)) return null;
  const tempmax = finite(hp.tempmax) ? hp.tempmax : 0;
  const max = Math.max(0, hp.max + tempmax);
  if (!max) return null;
  const value = Math.max(0, finite(hp.value) ? hp.value : 0);
  const temp = Math.max(0, finite(hp.temp) ? hp.temp : 0);
  let text = `HP ${value}/${max}`;
  if (temp) text += `, ${temp} temp`;
  if (tempmax) text += ` (max ${tempmax > 0 ? "+" : ""}${tempmax})`;
  return {
    pct: Math.min(100, Math.round((value / max) * 100)),
    tempPct: Math.min(100, Math.round((temp / max) * 100)),
    low: value > 0 && value <= max / 2,
    down: value === 0,
    text,
  };
}

export function buildEntries(members: MemberInput[], toggles: StatToggles): EntryView[] {
  return members.map(m => {
    const values: [StatKey, number | null][] = [
      ["ac", m.ac], ["prc", m.passives.prc], ["inv", m.passives.inv], ["ins", m.passives.ins], ["dc", m.spellDc],
    ];
    const stats = values
      .filter(([key, value]) => toggles[key] && finite(value))
      .map(([key, value]) => ({ key, icon: ICONS[key], value: String(value), label: `${SHORT[key] ?? LABELS[key]} ${value}` }));
    return {
      id: m.id,
      name: m.name,
      img: m.img,
      stats,
      hp: toggles.hp ? hpView(m.hp) : null,
      inspiration: toggles.inspiration ? m.inspiration : null,
    };
  });
}

/* -------------------------------------------- */
/*  Empty states                                */
/* -------------------------------------------- */

export type PartyState = "noCampaign" | "noFolder" | "emptyFolder" | "nonePresent" | "ok";

export function partyState(p: { campaign: boolean; folder: boolean; members: number; present: number }): PartyState {
  if (!p.campaign) return "noCampaign";
  if (!p.folder) return "noFolder";
  if (!p.members) return "emptyFolder";
  return p.present ? "ok" : "nonePresent";
}

/** Why the bar is empty, so the GM knows what to fix. */
export const EMPTY_HINTS: Record<Exclude<PartyState, "ok">, string> = {
  noCampaign: "No Campaign: create one in the Combat tab",
  noFolder: "No party: link a Party Folder to this Campaign",
  emptyFolder: "No player characters in the Party Folder",
  nonePresent: "Nobody is Present tonight",
};

/* -------------------------------------------- */
/*  Position                                    */
/* -------------------------------------------- */

export interface Point { left: number; top: number }
export interface Size { width: number; height: number }

/** Monk's TokenBar's old default spot: 15px from the left, its bottom edge 230px up. */
const MONK_DEFAULT = { left: 15, bottom: 230 };
const GAP = 8;

/** Keep the whole bar on screen. */
export function clampPosition(pos: Point, size: Size, viewport: Size): Point {
  const clamp = (n: number, max: number) => Math.round(Math.min(Math.max(0, n), Math.max(0, max)));
  return { left: clamp(pos.left, viewport.width - size.width), top: clamp(pos.top, viewport.height - size.height) };
}

/** A number from a saved position, where Monk's TokenBar may have left "" for an unused side. */
const coord = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** A saved {left, top} (ours), or null if there isn't one. */
export function savedPosition(saved: unknown): Point | null {
  const s = saved as Record<string, unknown> | null | undefined;
  const left = coord(s?.left), top = coord(s?.top);
  return left !== null && top !== null ? { left, top } : null;
}

/**
 * Where the bar sits: where the GM last dragged it; else exactly where their Monk's TokenBar sat (its user flag holds
 * {left, top}, or {left, bottom} from its own default); else just above the players list; else Monk's old default.
 */
export function startPosition(o: { saved: unknown; monk: unknown; players: Point | null; size: Size; viewport: Size }): Point {
  const place = (pos: Point) => clampPosition(pos, o.size, o.viewport);
  const saved = savedPosition(o.saved);
  if (saved) return place(saved);
  const monk = o.monk as Record<string, unknown> | null | undefined;
  const left = coord(monk?.left), top = coord(monk?.top), bottom = coord(monk?.bottom);
  if (left !== null && top !== null) return place({ left, top });
  if (left !== null && bottom !== null) return place({ left, top: o.viewport.height - bottom - o.size.height });
  if (o.players) return place({ left: o.players.left, top: o.players.top - o.size.height - GAP });
  return place({ left: MONK_DEFAULT.left, top: o.viewport.height - MONK_DEFAULT.bottom - o.size.height });
}

/* -------------------------------------------- */
/*  Roll requests                               */
/* -------------------------------------------- */

/** Our dnd5e request handlers (CONFIG.DND5E.requests). dnd5e's own "skill" handler does skills. */
export const CHECK_HANDLER = "encounter-deck.check";
export const SAVE_HANDLER = "encounter-deck.save";

export type RollKind = "skill" | "check" | "save";
export interface RollChoice { kind: RollKind; key: string }

/** The select's value: "skill:prc", "check:str", "save:dex". */
export const rollValue = (c: RollChoice) => `${c.kind}:${c.key}`;

export function parseRollChoice(value: string): RollChoice | null {
  const [kind, key] = String(value ?? "").split(":");
  return (kind === "skill" || kind === "check" || kind === "save") && key ? { kind, key } : null;
}

type Labelled = Record<string, { label?: string } | undefined>;

/** The one grouped select: Skills, then Ability checks, then Saving throws, from dnd5e's (localized) config. */
export function rollGroups(skills: Labelled, abilities: Labelled): { label: string; options: { value: string; label: string }[] }[] {
  const list = (config: Labelled, kind: RollKind) => Object.entries(config)
    .map(([key, c]) => ({ value: rollValue({ kind, key }), label: c?.label || key }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    { label: "Skills", options: list(skills, "skill") },
    { label: "Ability checks", options: list(abilities, "check") },
    { label: "Saving throws", options: list(abilities, "save") },
  ];
}

/** A DC typed into the dialog: a whole number from 1 up, or none. */
export function parseDc(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  return String(value ?? "").trim() !== "" && Number.isInteger(n) && n > 0 ? n : null;
}

const escapeText = (s: string) =>
  s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/**
 * The data for one dnd5e request chat message (`type: "request"`), as a Group actor's skill request makes it: a Roll
 * button per PC, each result linked back by dnd5e, and success or failure shown against the DC.
 */
export function requestMessageData(o: { choice: RollChoice; title: string; dc: number | null; flavor: string; targets: string[] }) {
  const handler = o.choice.kind === "skill" ? "skill" : o.choice.kind === "check" ? CHECK_HANDLER : SAVE_HANDLER;
  const data: Record<string, unknown> = o.choice.kind === "skill" ? { skill: o.choice.key } : { ability: o.choice.key };
  if (o.dc !== null) data.target = o.dc;
  const flavor = o.flavor.trim();
  return {
    type: "request",
    flavor: o.title,
    content: flavor ? `<p>${escapeText(flavor)}</p>` : "",
    system: {
      button: { icon: "fa-solid fa-dice-d20", label: o.title },
      data,
      handler,
      targets: o.targets.map(actor => ({ actor })),
    },
  };
}
