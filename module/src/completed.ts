/**
 * Completed folders: each Campaign keeps its played Encounters in a "Completed" folder of its own, hidden while
 * "Show completed" is off. Whatever marks an Encounter Completed (Finish, the row menu, the Builder) files it there and
 * remembers where it was; marking it Ready or Draft again puts it back. Encounters already Completed before this
 * existed are filed when the world loads.
 */
import { MODULE_ID, PACK_ID, type Status } from "./constants";
import { createQueue } from "./serial";
import { completedFolderOf, createFolder, encounterFlags, folderById, isCompletedFolder, kindOf, pack, rootOf } from "./store";

export const COMPLETED_FOLDER_NAME = "Completed";

/** Where an Encounter goes once its Status is set: into the Completed folder, back out of it, or nowhere. */
export function moveAfterStatus(status: Status, { inCompletedFolder, inCampaign }: { inCompletedFolder: boolean; inCampaign: boolean }): "file" | "return" | null {
  if (!inCampaign) return null;
  if (status === "completed") return inCompletedFolder ? null : "file";
  return inCompletedFolder ? "return" : null;
}

/** Folder creation and the moves run one at a time, so two at once never make two Completed folders. */
const oneAtATime = createQueue();

const ensureCompletedFolder = async (campaignId: string): Promise<any> =>
  completedFolderOf(campaignId) ?? createFolder(COMPLETED_FOLDER_NAME, campaignId, { kind: "completed" });

async function file(doc: any): Promise<void> {
  const folderId = doc._source.folder;
  const campaign = rootOf(folderId);
  if (kindOf(campaign) !== "campaign" || isCompletedFolder(folderId)) return;
  const folder = await ensureCompletedFolder(campaign.id);
  if (folder) await doc.update({ folder: folder.id, [`flags.${MODULE_ID}.completedFrom`]: folderId });
}

/** Back to the folder it was Completed from, if that's still in the same Campaign; otherwise the Campaign itself. */
async function unfile(doc: any): Promise<void> {
  const folderId = doc._source.folder;
  if (!isCompletedFolder(folderId)) return;
  const campaign = rootOf(folderId);
  const from = folderById(encounterFlags(doc).completedFrom);
  const back = from && rootOf(from.id)?.id === campaign?.id && !isCompletedFolder(from.id) ? from.id : campaign?.id;
  if (back) await doc.update({ folder: back, [`flags.${MODULE_ID}.completedFrom`]: null });
}

export function startCompletedFolders(): void {
  Hooks.on("updateActor", (doc: any, changes: any, _options: any, userId: string) => {
    if (doc.pack !== PACK_ID || userId !== game.user.id) return;
    const status: Status | undefined = changes.flags?.[MODULE_ID]?.status;
    if (!status) return;
    const folderId = doc._source.folder;
    const move = moveAfterStatus(status, { inCompletedFolder: isCompletedFolder(folderId), inCampaign: kindOf(rootOf(folderId)) === "campaign" });
    if (!move) return;
    oneAtATime(() => (move === "file" ? file(doc) : unfile(doc))).catch((err: unknown) => {
      console.error("Encounter Deck | Couldn't move the Encounter for its new Status", err);
    });
  });
}

/** File every Completed Encounter that isn't in its Campaign's Completed folder yet (made before v0.10, or moved by hand). */
export const fileLooseCompleted = (): Promise<void> => oneAtATime(async () => {
  if (!game.users.activeGM?.isSelf || !pack()) return;
  const loose = pack().index.filter((e: any) => e.type === "encounter" && e.flags?.[MODULE_ID]?.status === "completed"
    && !isCompletedFolder(e.folder) && kindOf(rootOf(e.folder)) === "campaign");
  if (!loose.length) return;
  const updates: object[] = [];
  for (const e of loose) {
    const folder = await ensureCompletedFolder(rootOf(e.folder).id);
    if (folder) updates.push({ _id: e._id, folder: folder.id, [`flags.${MODULE_ID}.completedFrom`]: e.folder });
  }
  await CONFIG.Actor.documentClass.updateDocuments(updates, { pack: PACK_ID });
  console.log(`Encounter Deck | Moved ${updates.length} Completed Encounter(s) into their Campaign's Completed folder.`);
});
