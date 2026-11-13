/**
 * The Encounter Deck compendium (ADR 0001): an Actor pack of dnd5e Encounter actors (ADR 0003), with the
 * Shared Library and each Campaign as top-level folders. The browser works from the pack's index; a full
 * Encounter document is only fetched when the Builder opens it.
 */
import { CHANGED_HOOK, MODULE_ID, PACK_ID, PACK_NAME, type EncounterFlags, type FolderKind } from "./constants";

export const INDEX_FIELDS = ["type", "folder", "system.members", `flags.${MODULE_ID}`];
const LIBRARY_NAME = "Shared Library";

const ActorClass = () => CONFIG.Actor.documentClass;
const FolderClass = () => CONFIG.Folder.documentClass;

export const pack = (): any => game.packs.get(PACK_ID);

/** Create the pack and the Shared Library folder the first time the module runs in a world. */
export async function ensureStorage(): Promise<void> {
  if (!game.user.isGM) return;
  let p = pack();
  if (!p) {
    if (!game.users.activeGM?.isSelf) return;
    p = await foundry.documents.collections.CompendiumCollection.createCompendium({
      name: PACK_NAME,
      label: "Encounter Deck",
      type: "Actor",
      ownership: { PLAYER: "NONE", TRUSTED: "NONE", ASSISTANT: "OWNER" },
    });
  }
  if (!p) return;
  if (!libraryFolder() && game.users.activeGM?.isSelf) {
    await FolderClass().create({ name: LIBRARY_NAME, type: "Actor", sorting: "a", flags: { [MODULE_ID]: { kind: "library" } } }, { pack: PACK_ID });
  }
  await p.getIndex({ fields: INDEX_FIELDS });
}

/** Tell the browser and Builder to refresh when our pack's contents, the party or its folder change. */
export function watchChanges(): void {
  const notify = foundry.utils.debounce(() => Hooks.callAll(CHANGED_HOOK), 50);
  for (const doc of ["Actor", "Folder"]) {
    for (const action of ["create", "update", "delete"]) {
      Hooks.on(`${action}${doc}`, (document: any) => {
        // Our pack, or a world actor/folder that might be (or hold) a party member.
        if (document.pack === PACK_ID || (!document.pack && (doc === "Folder" ? document.type === "Actor" : document.type === "character"))) notify();
      });
    }
  }
  // A character's level comes from its class items.
  for (const action of ["create", "update", "delete"]) {
    Hooks.on(`${action}Item`, (item: any) => { if (item.type === "class" && item.parent?.type === "character" && !item.pack) notify(); });
  }
}

/* -------------------------------------------- */
/*  Folders                                     */
/* -------------------------------------------- */

export const kindOf = (folder: any): FolderKind | undefined => folder?.flags?.[MODULE_ID]?.kind;
export const folders = (): any[] => pack()?.folders.contents ?? [];
export const folderById = (id: string | null | undefined): any => (id ? pack()?.folders.get(id) ?? null : null);
export const libraryFolder = (): any => folders().find(f => kindOf(f) === "library") ?? null;
export const campaignFolders = (): any[] =>
  folders().filter(f => kindOf(f) === "campaign").sort((a, b) => a.name.localeCompare(b.name));

const parentIdOf = (folder: any): string | null => folder?._source?.folder ?? null;

/** The Campaign or Shared Library folder a folder sits in (itself, if it is one). */
export function rootOf(folderId: string | null | undefined): any {
  let folder = folderById(folderId);
  for (let i = 0; folder && i < 10; i++) {
    const parent = folderById(parentIdOf(folder));
    if (!parent) return folder;
    folder = parent;
  }
  return folder ?? null;
}

export const childFolders = (parentId: string): any[] =>
  folders().filter(f => parentIdOf(f) === parentId).sort((a, b) => a.name.localeCompare(b.name));

/** How deep a folder is from the pack root (a Campaign is 1). Foundry allows CONST.FOLDER_MAX_DEPTH. */
export function depthOf(folderId: string): number {
  let depth = 0;
  for (let f = folderById(folderId); f && depth < 10; f = folderById(parentIdOf(f))) depth++;
  return depth;
}

export async function createFolder(name: string, parentId: string | null, flags?: object): Promise<any> {
  return FolderClass().create({ name, type: "Actor", folder: parentId, sorting: "a", flags: flags ? { [MODULE_ID]: flags } : {} }, { pack: PACK_ID });
}

/** Delete a folder with everything inside it. */
export async function deleteFolder(id: string): Promise<void> {
  const folder = folderById(id);
  if (!folder) return;
  // Foundry only deletes a compendium folder's direct contents, so collect the whole subtree first.
  const ids = new Set<string>([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders()) if (!ids.has(f.id) && ids.has(parentIdOf(f)!)) { ids.add(f.id); grew = true; }
  }
  const actorIds = pack().index.filter((e: any) => ids.has(e.folder)).map((e: any) => e._id);
  if (actorIds.length) await ActorClass().deleteDocuments(actorIds, { pack: PACK_ID });
  await FolderClass().deleteDocuments([...ids], { pack: PACK_ID });
}

/* -------------------------------------------- */
/*  Encounters                                  */
/* -------------------------------------------- */

export const encounterFlags = (doc: any): EncounterFlags => ({ ...defaultFlags(), ...(doc?.flags?.[MODULE_ID] ?? {}) });

export function defaultFlags(): EncounterFlags {
  return { status: "draft", tags: [], notes: "", tactics: "", link: null, entries: [], copiedFrom: null };
}

/** Index entries of the Encounters directly inside a folder. */
export const encountersIn = (folderId: string): any[] =>
  (pack()?.index.contents ?? []).filter((e: any) => e.type === "encounter" && e.folder === folderId)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

export const getEncounter = (id: string): Promise<any> => pack().getDocument(id);

export async function createEncounter(folderId: string, name = "New Encounter"): Promise<any> {
  return ActorClass().create({ name, type: "encounter", folder: folderId, flags: { [MODULE_ID]: defaultFlags() } }, { pack: PACK_ID });
}

/** Copy an Encounter into a folder. A copy of a Completed one starts over as Ready. */
export async function copyEncounter(id: string, folderId: string, { rename = false, fromMaster = false } = {}): Promise<any> {
  const source = await getEncounter(id);
  if (!source) return null;
  const data = source.toObject();
  delete data._id;
  delete data._stats;
  data.folder = folderId;
  if (rename) data.name = `${data.name} (Copy)`;
  const flags = { ...defaultFlags(), ...(data.flags?.[MODULE_ID] ?? {}) };
  if (flags.status === "completed") flags.status = "ready";
  if (fromMaster) flags.copiedFrom = source.uuid;
  data.flags = { ...data.flags, [MODULE_ID]: flags };
  return ActorClass().create(data, { pack: PACK_ID });
}

export async function moveEncounter(id: string, folderId: string): Promise<void> {
  const doc = await getEncounter(id);
  await doc?.update({ folder: folderId });
}

export async function deleteEncounter(id: string): Promise<void> {
  await ActorClass().deleteDocuments([id], { pack: PACK_ID });
}

export const isInLibrary = (folderId: string | null | undefined) => kindOf(rootOf(folderId)) === "library";
