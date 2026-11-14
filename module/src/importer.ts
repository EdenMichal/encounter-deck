/**
 * Import (ADR 0002): bring an Encounter's creatures into the world for a fight. Compendium monsters are copied
 * into a hidden Actors folder, their tokens go into the Margin of the scene being viewed, and they plus the present
 * PCs join the combat tracker. It can be repeated mid-fight for reinforcements; Finish undoes it.
 */
import { MODULE_ID } from "./constants";
import { activeCampaign, partyOf } from "./campaigns";
import { addEntry, readEntries, toSource, totalXp } from "./entries";
import { hasMargin, mainEncounterOf, marginSlots, rollNow, tokenNames, type FightRecord, type Footprint } from "./fight";
import { lairDelta } from "./legendary";
import { createQueue, sharedInFlight } from "./serial";
import { lookupMonster, xpForCr } from "./sources";
import { copyEncounter, encounterFlags, getEncounter, isInLibrary, rootOf } from "./store";

const IMPORTED_FOLDER = "Encounter Deck: In Combat";

/** One Import (or one monster added mid-fight), remembered on the combat so Finish knows what to award and mark Completed. */
export interface ImportRecord extends FightRecord {
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

/**
 * Every world Actors folder that holds imported monsters while a fight runs. Players can't see what's in them. There
 * should be one, but up to v0.9 one Import could create several at once, so Finish and reuse look in all of them.
 */
export const importedFolders = (): any[] => game.folders.filter((f: any) => f.type === "Actor" && f.flags?.[MODULE_ID]?.kind === "imported");

/** The folder new imported monsters go into. Concurrent callers (one per Creature Entry) share a single create. */
const ensureImportedFolder = sharedInFlight(async (): Promise<any> => importedFolders()[0] ?? CONFIG.Folder.documentClass.create({
  name: IMPORTED_FOLDER, type: "Actor", sorting: "a", color: "#3b2e4a", flags: { [MODULE_ID]: { kind: "imported" } },
}));

/**
 * The world actor a Creature Entry's tokens come from. A world actor is used as it is; a compendium monster is
 * copied into the hidden folder once and reused for reinforcements until Finish removes it.
 */
async function worldActorFor(uuid: string): Promise<any> {
  const source = await fromUuid(uuid);
  if (!source) return null;
  if (!source.pack) return source;
  const existing = importedFolders().flatMap(f => f.contents).find((a: any) => a.flags?.[MODULE_ID]?.source === uuid);
  if (existing) return existing;
  const folder = await ensureImportedFolder();
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

const areaOf = (scene: any) =>
  ({ width: scene.dimensions.width, height: scene.dimensions.height, size: scene.dimensions.size, sceneRect: scene.dimensions.sceneRect });

/** One Creature Entry about to be placed: its UUID, how many, and the world actor its tokens come from. */
interface Placement { uuid: string; count: number; actor: any }

/** Free spots in the scene's Margin for every token of these creatures, or null when they don't fit. */
function slotsFor(scene: any, list: Placement[]): { x: number; y: number }[] | null {
  const footprints: Footprint[] = list.flatMap(({ count, actor }) =>
    Array(count).fill({ width: actor.prototypeToken.width, height: actor.prototypeToken.height }));
  const size = scene.dimensions.size;
  const occupied = scene.tokens.map((t: any) => ({ x: t.x, y: t.y, width: t.width * size, height: t.height * size }));
  return marginSlots(areaOf(scene), occupied, footprints);
}

/**
 * Numbered, unlinked tokens in the Margin, continuing the fight's numbering (Goblin 5, 6…), each joined to the
 * combat. In its lair, a monster that has a lair is put inside it on its own token. Returns the new tokens and the
 * fight's updated counts, for the caller to save with its Import record.
 */
async function placeTokens(scene: any, combat: any, list: Placement[], slots: { x: number; y: number }[], inLair: boolean) {
  const counts = new Map(combatFlags(combat).counts.map(c => [c.uuid, c.n]));
  const lair = (actor: any) => lairDelta(!!actor.system?.resources?.lair?.value, inLair);
  const tokenData: object[] = [];
  let slot = 0;
  for (const { uuid, count, actor } of list) {
    const already = counts.get(uuid) ?? 0;
    const names = tokenNames(actor.prototypeToken.name || actor.name, already, count);
    counts.set(uuid, already + count);
    for (const name of names) {
      const { x, y } = slots[slot++];
      const token = await actor.getTokenDocument({
        x, y, name, actorLink: false, appendNumber: false, prependAdjective: false, hidden: false,
        flags: { [MODULE_ID]: { combat: combat.id, source: uuid } },
        // Unlinked, so the lair goes on this token's own copy and never on a world actor.
        ...(lair(actor) ? { delta: lair(actor) } : {}),
      }, { parent: scene });
      tokenData.push(token.toObject());
    }
  }
  const tokens = await scene.createEmbeddedDocuments("Token", tokenData);
  return { tokens, counts: [...counts].map(([uuid, n]) => ({ uuid, n })) };
}

/**
 * Imports and monsters dropped onto the tracker run one at a time: each reads the fight's records and token numbering
 * and writes them back, so two at once (a double click, two quick drops) would lose one's record and repeat names.
 */
const oneAtATime = createQueue();

/** Import an Encounter into the scene you're viewing. A Master Copy is copied into the Active Campaign first. */
export const importEncounter = (id: string): Promise<boolean> => oneAtATime(() => importNow(id));

async function importNow(id: string): Promise<boolean> {
  if (!game.user.isGM) return false;
  const scene = canvas.scene;
  if (!scene) return warn("View a scene first: Import puts the tokens in its Margin.");
  if (!hasMargin(areaOf(scene))) return warn(noMargin(scene));

  let encounter = await getEncounter(id);
  if (!encounter) return warn("That Encounter is gone.");
  const fromLibrary = isInLibrary(encounter.folder?.id ?? encounter._source.folder);
  const campaign = fromLibrary ? activeCampaign() : rootOf(encounter.folder?.id ?? encounter._source.folder);
  if (fromLibrary && !campaign) return warn("Create a Campaign first: a Master Copy is copied into the Active Campaign before it's imported.");

  const flags = encounterFlags(encounter);
  const entries = readEntries(encounter._source.system?.members ?? [], flags.entries, lookupMonster);
  const live = entries.filter(e => !e.missing && e.count > 0);
  const skipped = entries.filter(e => e.missing).map(e => e.name);
  if (!live.length) return warn(`"${encounter.name}" has no creatures to import.`);

  // Resolve every actor before touching the scene, so a failure leaves nothing half-placed.
  const actors = await Promise.all(live.map(e => worldActorFor(e.uuid)));
  const usable: Placement[] = live.map((e, i) => ({ uuid: e.uuid, count: e.count, actor: actors[i] })).filter(x => x.actor);
  const found = live.filter((_, i) => actors[i]);
  skipped.push(...live.filter((_, i) => !actors[i]).map(e => e.name));
  if (!usable.length) return warn(`Couldn't bring in any creature of "${encounter.name}": ${skipped.join(", ")}.`);

  const slots = slotsFor(scene, usable);
  if (!slots) return warn(noRoom(scene, usable.reduce((n, p) => n + p.count, 0)));

  // Only now that it will go ahead: a Master Copy is copied, so a failed Import leaves no stray copy behind.
  if (fromLibrary) {
    encounter = await copyEncounter(id, campaign.id, { fromMaster: true });
    if (!encounter) return false;
  }

  const combat = await combatFor(scene);
  const state = combatFlags(combat);
  const { tokens, counts } = await placeTokens(scene, combat, usable, slots, !!flags.inLair);

  const combatants: object[] = tokens.map((t: any) => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId }));
  // The present PCs join without tokens, unless they already have one on this scene.
  for (const { actor, present } of partyOf(campaign)) {
    if (!present || combat.combatants.some((c: any) => c.actorId === actor.id)) continue;
    const token = scene.tokens.find((t: any) => t.actorId === actor.id);
    combatants.push(token ? { tokenId: token.id, sceneId: scene.id, actorId: actor.id } : { actorId: actor.id });
  }
  const created = await combat.createEmbeddedDocuments("Combatant", combatants);
  await rollForNewMonsters(combat, created);

  const record: ImportRecord = { encounterId: encounter.id, name: encounter.name, xp: totalXp(found), campaignId: campaign?.id ?? null, kind: "import" };
  await combat.update({ [`flags.${MODULE_ID}`]: { imports: [...state.imports, record], counts } });

  const again = state.imports.length ? " as reinforcements" : "";
  ui.notifications.info(`Imported "${encounter.name}"${again}: ${tokens.length} creature${tokens.length === 1 ? "" : "s"}.`);
  if (skipped.length) ui.notifications.warn(`Skipped missing creatures: ${skipped.join(", ")}.`);
  return true;
}

/**
 * One monster dropped onto the combat tracker mid-fight: a numbered token in the Margin of the fight's scene, a
 * combatant, and a Creature Entry in the Encounter the fight started with, so the Encounter records what was
 * actually fought. Its XP counts at Finish.
 */
export const addToFight = (uuid: string, combat: any): Promise<boolean> => oneAtATime(() => addNow(uuid, combat));

async function addNow(uuid: string, combat: any): Promise<boolean> {
  if (!game.user.isGM || !combat) return false;
  const state = combatFlags(combat);
  const encounterId = mainEncounterOf(state.imports);
  if (!encounterId) return warn("Import an Encounter first: a monster dropped on the tracker joins the fight's Encounter.");
  const scene = combat.scene ?? canvas.scene;
  if (!scene) return warn("This fight has no scene to put the token on.");
  if (!hasMargin(areaOf(scene))) return warn(noMargin(scene));

  const source = await fromUuid(uuid);
  if (source?.documentName !== "Actor" || source.type !== "npc") return warn("Only NPC actors can join the fight.");
  const encounter = await getEncounter(encounterId).catch(() => null);
  if (!encounter) return warn("The Encounter this fight started with is gone.");

  const actor = await worldActorFor(uuid);
  if (!actor) return warn(`Couldn't bring in ${source.name}.`);
  const list: Placement[] = [{ uuid, count: 1, actor }];
  const slots = slotsFor(scene, list);
  if (!slots) return warn(noRoom(scene, 1));

  const flags = encounterFlags(encounter);
  const { tokens, counts } = await placeTokens(scene, combat, list, slots, !!flags.inLair);
  const created = await combat.createEmbeddedDocuments("Combatant", tokens.map((t: any) => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
  await rollForNewMonsters(combat, created);

  // Save it into the Encounter as a Creature Entry (or one more of an entry it already has).
  // From the full document, not the index: the index may not have its CR loaded yet.
  const cr: number | null = Number.isFinite(Number(source.system?.details?.cr)) ? Number(source.system.details.cr) : null;
  const monster = { uuid, name: source.name, img: source.img, cr, xp: xpForCr(cr) };
  const entries = addEntry(readEntries(encounter._source.system?.members ?? [], flags.entries, lookupMonster), monster, 1);
  const { members, cache } = toSource(entries);
  await encounter.update({ "system.members": members, [`flags.${MODULE_ID}.entries`]: cache });

  const campaign = rootOf(encounter.folder?.id ?? encounter._source.folder);
  const record: ImportRecord = { encounterId, name: tokens[0]?.name ?? source.name, xp: monster.xp, campaignId: campaign?.id ?? null, kind: "added" };
  await combat.update({ [`flags.${MODULE_ID}`]: { imports: [...state.imports, record], counts } });
  ui.notifications.info(`Added ${record.name} to the fight and to "${encounter.name}".`);
  return true;
}

/**
 * Mid-fight, monsters that join roll initiative straight away, so they slot into the turn order and the current
 * turn stays where it is. The rolls are GM-only, like a hidden monster's.
 */
async function rollForNewMonsters(combat: any, created: any[]): Promise<void> {
  const ids = rollNow(!!combat.started, created.map((c: any) => ({ id: c.id, isNPC: !!c.isNPC, initiative: c.initiative ?? null })));
  if (!ids.length) return;
  try {
    await combat.rollInitiative(ids, { updateTurn: true, messageMode: "gm" });
  } catch (err) {
    console.error("Encounter Deck | Couldn't roll initiative for the new monsters", err);
    ui.notifications.warn("Encounter Deck couldn't roll initiative for the new monsters. Roll it from the tracker.");
  }
}

const noMargin = (scene: any) =>
  `"${scene.name}" has no Margin. Give the scene some padding (Scene Configuration › Grid) so the tokens stay off the map.`;
const noRoom = (scene: any, n: number) =>
  `Not enough room in the Margin of "${scene.name}" for ${n} token${n === 1 ? "" : "s"}. Give the scene more padding.`;

function warn(message: string): false {
  ui.notifications.warn(message);
  return false;
}
