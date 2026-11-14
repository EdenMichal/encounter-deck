/**
 * The Builder searches the Sources: every Actor compendium holding monsters that is switched on in dnd5e's own
 * Compendium Browser source checklist (dnd5e.packSourceConfiguration), where each pack is on unless switched
 * off (ADR 0003). Our Sources dialog edits that same checklist, showing only the compendiums with monsters.
 */
import { PACK_ID, type EntryCache } from "./constants";
import { crToXp } from "./difficulty";
import { monsterFromIndex, parseCr, sortMonsters, type Monster } from "./monsters";
import { countEntry, isOn, toggled, type PackageType, type PackSummary, type SourceConfig } from "./source-list";

const FIELDS = ["type", "system.details.cr", "system.details.type.value", "system.traits.size", "system.details.habitat",
  "system.source.book", "system.source.rules"];
let monsters: Monster[] | null = null;
let loading: Promise<Monster[]> | null = null;

export const xpForCr = (cr: number | null) => crToXp(cr, CONFIG.DND5E.CR_EXP_LEVELS);

export const sourceConfig = (): SourceConfig => game.settings.get("dnd5e", "packSourceConfiguration") ?? {};

/** Every Actor compendium that could be a Source, on or off (never our own Encounter Deck pack). */
const actorPacks = (): any[] => game.packs.filter((p: any) => p.documentName === "Actor" && p.collection !== PACK_ID);

/** The Actor compendiums switched on in dnd5e's checklist. */
export function sourcePacks(): any[] {
  const config = sourceConfig();
  return actorPacks().filter((p: any) => isOn(config, p.collection));
}

const packInfo = (p: any) => ({ sourceBook: p.metadata.flags?.dnd5e?.sourceBook ?? "", label: p.metadata.label ?? p.title ?? "" });

function packageTitle(p: any): string {
  const { packageType, packageName } = p.metadata;
  if (packageType === "system") return game.system.title ?? packageName;
  if (packageType === "world") return game.world.title ?? packageName;
  return game.modules.get(packageName)?.title ?? packageName;
}

/** Every Actor compendium with how many monsters it holds, for the Sources dialog. Reads the same indexes as the Builder. */
export async function packSummaries(): Promise<PackSummary[]> {
  const out: PackSummary[] = [];
  for (const p of actorPacks()) {
    const summary: PackSummary = {
      id: p.collection, label: packInfo(p).label, packageType: p.metadata.packageType as PackageType,
      packageName: p.metadata.packageName, packageTitle: packageTitle(p), sourceBook: packInfo(p).sourceBook, monsters: 0, rules: [],
    };
    try {
      const index = await p.getIndex({ fields: FIELDS });
      for (const entry of index) countEntry(summary, entry);
    } catch (err) {
      console.warn(`Encounter Deck | Could not index ${p.collection}`, err);
    }
    out.push(summary);
  }
  return out;
}

/** Switch packs on or off in dnd5e's world-wide checklist, keeping every other pack as it was. */
export const setSources = (ids: string[], on: boolean): Promise<unknown> =>
  game.settings.set("dnd5e", "packSourceConfiguration", toggled(sourceConfig(), ids, on));

/** How many Sources hold monsters, once they're loaded. */
export const monsterPackCount = (): number | null => (monsters ? new Set(monsters.map(m => m.pack)).size : null);

/** Every NPC in the Sources, loaded from the compendium indexes once and cached. */
export function loadMonsters(): Promise<Monster[]> {
  if (monsters) return Promise.resolve(monsters);
  loading ??= (async () => {
    const all: Monster[] = [];
    for (const p of sourcePacks()) {
      try {
        const index = await p.getIndex({ fields: FIELDS });
        for (const entry of index) {
          const m = monsterFromIndex(entry, p.collection, xpForCr, packInfo(p));
          if (m) all.push(m);
        }
      } catch (err) {
        console.warn(`Encounter Deck | Could not index ${p.collection}`, err);
      }
    }
    monsters = sortMonsters(all);
    loading = null;
    return monsters;
  })();
  return loading;
}

export const cachedMonsters = (): Monster[] | null => monsters;

export function invalidateMonsters(): void {
  monsters = null;
}

/** dnd5e's own checklist of every compendium, for anything our Sources dialog doesn't show. */
export function openDnd5eSourcesConfig(): void {
  const menu = game.settings.menus.get("dnd5e.packSourceConfiguration");
  if (menu) new menu.type().render({ force: true });
}

/** The live monster behind a Creature Entry, or null when it (or its Source compendium) is gone. */
export function lookupMonster(uuid: string): EntryCache | null {
  let found: any = null;
  try { found = fromUuidSync(uuid, { strict: false }); } catch { found = null; }
  if (!found) return null;
  const crValue = found.system?.details?.cr;
  const cr = crValue === undefined ? null : parseCr(crValue);
  const known = monsters?.find(m => m.uuid === uuid);
  return {
    uuid,
    name: found.name ?? known?.name ?? "",
    img: found.img ?? known?.img ?? "",
    cr: cr ?? known?.cr ?? null,
    xp: cr !== null ? xpForCr(cr) : known?.xp ?? 0,
  };
}
