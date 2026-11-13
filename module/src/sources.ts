/**
 * The Builder searches the Sources: every Actor compendium switched on in dnd5e's own Compendium Browser
 * source checklist (dnd5e.packSourceConfiguration), where each pack is on unless switched off (ADR 0003).
 */
import { PACK_ID, type EntryCache } from "./constants";
import { crToXp } from "./difficulty";
import { monsterFromIndex, parseCr, sortMonsters, type Monster } from "./monsters";

const FIELDS = ["type", "system.details.cr", "system.details.type.value", "system.traits.size", "system.details.habitat"];
let monsters: Monster[] | null = null;
let loading: Promise<Monster[]> | null = null;

export const xpForCr = (cr: number | null) => crToXp(cr, CONFIG.DND5E.CR_EXP_LEVELS);

export function sourcePacks(): any[] {
  const config = game.settings.get("dnd5e", "packSourceConfiguration") ?? {};
  return game.packs.filter((p: any) => p.documentName === "Actor" && p.collection !== PACK_ID && config[p.collection] !== false);
}

/** Every NPC in the Sources, loaded from the compendium indexes once and cached. */
export function loadMonsters(): Promise<Monster[]> {
  if (monsters) return Promise.resolve(monsters);
  loading ??= (async () => {
    const all: Monster[] = [];
    for (const p of sourcePacks()) {
      try {
        const index = await p.getIndex({ fields: FIELDS });
        for (const entry of index) {
          const m = monsterFromIndex(entry, p.collection, xpForCr);
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

export function openSourcesConfig(): void {
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
