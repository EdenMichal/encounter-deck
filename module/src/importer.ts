/**
 * Import (ADR 0002): bring an Encounter's creatures into the world for a fight. Compendium monsters are copied
 * into a hidden Actors folder, their tokens go into the Margin of the scene being viewed, and they plus the present
 * PCs join the combat tracker. It can be repeated mid-fight for reinforcements; Finish undoes it.
 */
import { MODULE_ID } from "./constants";
import { activeCampaign, partyOf } from "./campaigns";
import { readEntries, totalXp } from "./entries";
import { hasMargin, marginSlots, tokenNames, type Footprint } from "./fight";
import { lookupMonster } from "./sources";
import { copyEncounter, encounterFlags, getEncounter, isInLibrary, rootOf } from "./store";

const IMPORTED_FOLDER = "Encounter Deck: In Combat";

/** One Import, remembered on the combat so Finish knows what to award and mark Completed. */
export interface ImportRecord {
  encounterId: string;
  name: string;
  xp: number;
  campaignId: string | null;
}

export interface CombatFlags {
  imports: ImportRecord[];
  /**
   * How many of each monster (by Creature Entry UUID) this fight already has, so numbering continues. A list, not
   * an object: UUIDs contain dots, which Foundry would expand into nested keys.
   */
  counts: { uuid: string; n: number }[];
}

export const combatFlags = (combat: any): CombatFlags => ({ imports: [], counts: [], ...(combat?.flags?.[MODULE_ID] ?? {}) });

/** The world Actors folder that holds imported monsters while a fight runs. Players can't see what's in it. */
export const importedFolder = (): any => game.folders.find((f: any) => f.type === "Actor" && f.flags?.[MODULE_ID]?.kind === "imported") ?? null;

async function ensureImportedFolder(): Promise<any> {
  return importedFolder() ?? CONFIG.Folder.documentClass.create({
    name: IMPORTED_FOLDER, type: "Actor", sorting: "a", color: "#3b2e4a", flags: { [MODULE_ID]: { kind: "imported" } },
  });
}

/**
 * The world actor a Creature Entry's tokens come from. A world actor is used as it is; a compendium monster is
 * copied into the hidden folder once and reused for reinforcements until Finish removes it.
 */
async function worldActorFor(uuid: string): Promise<any> {
  const source = await fromUuid(uuid);
  if (!source) return null;
  if (!source.pack) return source;
  const folder = await ensureImportedFolder();
  const existing = folder.contents.find((a: any) => a.flags?.[MODULE_ID]?.source === uuid);
  if (existing) return existing;
  // Not game.actors.importFromCompendium: it switches the sidebar to the Actors tab.
  const data = game.actors.fromCompendium(source);
  data.folder = folder.id;
  data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  foundry.utils.setProperty(data, `flags.${MODULE_ID}`, { imported: true, source: uuid });
  return CONFIG.Actor.documentClass.create(data);
}

/** The combat to import into: the one on this scene (preferring the active one), or a new one. */
async function combatFor(scene: any): Promise<any> {
  const here = (c: any) => c.scene?.id === scene.id;
  const existing = (game.combat && here(game.combat) ? game.combat : null) ?? game.combats.find(here);
  if (existing) {
    if (!existing.active) await existing.activate();
    return existing;
  }
  return CONFIG.Combat.documentClass.create({ scene: scene.id, active: true });
}

/** Import an Encounter into the scene you're viewing. A Master Copy is copied into the Active Campaign first. */
export async function importEncounter(id: string): Promise<boolean> {
  if (!game.user.isGM) return false;
  const scene = canvas.scene;
  if (!scene) return warn("View a scene first: Import puts the tokens in its Margin.");
  const area = { width: scene.dimensions.width, height: scene.dimensions.height, size: scene.dimensions.size, sceneRect: scene.dimensions.sceneRect };
  if (!hasMargin(area)) return warn(`"${scene.name}" has no Margin. Give the scene some padding (Scene Configuration › Grid) so the tokens stay off the map.`);

  let encounter = await getEncounter(id);
  if (!encounter) return warn("That Encounter is gone.");
  if (isInLibrary(encounter.folder?.id ?? encounter._source.folder)) {
    const campaign = activeCampaign();
    if (!campaign) return warn("Create a Campaign first: a Master Copy is copied into the Active Campaign before it's imported.");
    encounter = await copyEncounter(id, campaign.id, { fromMaster: true });
    if (!encounter) return false;
  }

  const flags = encounterFlags(encounter);
  const entries = readEntries(encounter._source.system?.members ?? [], flags.entries, lookupMonster);
  const live = entries.filter(e => !e.missing && e.count > 0);
  const skipped = entries.filter(e => e.missing).map(e => e.name);
  if (!live.length) return warn(`"${encounter.name}" has no creatures to import.`);

  // Resolve every actor before touching the scene, so a failure leaves nothing half-placed.
  const actors = await Promise.all(live.map(e => worldActorFor(e.uuid)));
  const usable = live.map((entry, i) => ({ entry, actor: actors[i] })).filter(x => x.actor);
  if (usable.length < live.length) skipped.push(...live.filter((_, i) => !actors[i]).map(e => e.name));

  const footprints: Footprint[] = usable.flatMap(({ entry, actor }) =>
    Array(entry.count).fill({ width: actor.prototypeToken.width, height: actor.prototypeToken.height }));
  const size = area.size;
  const occupied = scene.tokens.map((t: any) => ({ x: t.x, y: t.y, width: t.width * size, height: t.height * size }));
  const slots = marginSlots(area, occupied, footprints);
  if (!slots) return warn(`Not enough room in the Margin of "${scene.name}" for ${footprints.length} tokens. Give the scene more padding.`);

  const combat = await combatFor(scene);
  const state = combatFlags(combat);
  const counts = new Map(state.counts.map(c => [c.uuid, c.n]));
  const tokenData: object[] = [];
  let slot = 0;
  for (const { entry, actor } of usable) {
    const already = counts.get(entry.uuid) ?? 0;
    const names = tokenNames(actor.prototypeToken.name || actor.name, already, entry.count);
    counts.set(entry.uuid, already + entry.count);
    for (const name of names) {
      const { x, y } = slots[slot++];
      const token = await actor.getTokenDocument({
        x, y, name, actorLink: false, appendNumber: false, prependAdjective: false, hidden: false,
        flags: { [MODULE_ID]: { combat: combat.id, source: entry.uuid } },
      }, { parent: scene });
      tokenData.push(token.toObject());
    }
  }
  const tokens = await scene.createEmbeddedDocuments("Token", tokenData);

  const combatants: object[] = tokens.map((t: any) => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId }));
  // The present PCs join without tokens, unless they already have one on this scene.
  const campaign = rootOf(encounter.folder?.id ?? encounter._source.folder);
  for (const { actor, present } of partyOf(campaign)) {
    if (!present || combat.combatants.some((c: any) => c.actorId === actor.id)) continue;
    const token = scene.tokens.find((t: any) => t.actorId === actor.id);
    combatants.push(token ? { tokenId: token.id, sceneId: scene.id, actorId: actor.id } : { actorId: actor.id });
  }
  await combat.createEmbeddedDocuments("Combatant", combatants);

  const record: ImportRecord = { encounterId: encounter.id, name: encounter.name, xp: totalXp(live), campaignId: campaign?.id ?? null };
  await combat.update({ [`flags.${MODULE_ID}`]: {
    imports: [...state.imports, record],
    counts: [...counts].map(([uuid, n]) => ({ uuid, n })),
  } });

  const again = state.imports.length ? " as reinforcements" : "";
  ui.notifications.info(`Imported "${encounter.name}"${again}: ${tokens.length} creature${tokens.length === 1 ? "" : "s"}.`);
  if (skipped.length) ui.notifications.warn(`Skipped missing creatures: ${skipped.join(", ")}.`);
  return true;
}

function warn(message: string): false {
  ui.notifications.warn(message);
  return false;
}
