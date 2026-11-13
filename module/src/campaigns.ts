/**
 * Campaigns are top-level folders in our pack. Their flags hold the Party Folder (a world Actors folder),
 * the Advancement Mode and which party members are absent tonight.
 */
import { MODULE_ID, type AdvancementMode, type CampaignAdvancement } from "./constants";
import { setting, setSetting } from "./settings";
import { campaignFolders, createFolder, deleteFolder, folderById, kindOf } from "./store";

export interface CampaignFlags {
  kind: "campaign";
  partyFolder: string | null;
  advancement: CampaignAdvancement;
  absent: string[];
}

export interface PartyMember { actor: any; present: boolean; level: number }

export const campaignFlags = (folder: any): CampaignFlags => ({
  kind: "campaign", partyFolder: null, advancement: "default", absent: [], ...(folder?.flags?.[MODULE_ID] ?? {}),
});

/** The Active Campaign: the remembered one, or the first Campaign if that one is gone. */
export function activeCampaign(): any {
  const all = campaignFolders();
  return all.find(f => f.id === setting("activeCampaign")) ?? all[0] ?? null;
}

export const setActiveCampaign = (id: string) => setSetting("activeCampaign", id);

export async function createCampaign(name: string): Promise<any> {
  const flags: CampaignFlags = { kind: "campaign", partyFolder: null, advancement: "default", absent: [] };
  const folder = await createFolder(name, null, flags);
  if (folder) await setActiveCampaign(folder.id);
  return folder;
}

export async function deleteCampaign(id: string): Promise<void> {
  if (kindOf(folderById(id)) !== "campaign") return;
  await deleteFolder(id);
}

export function advancementOf(campaign: any): AdvancementMode {
  const own = campaignFlags(campaign).advancement;
  return own === "default" ? (setting("defaultAdvancement") as AdvancementMode) : own;
}

/** The player characters directly inside the Campaign's Party Folder (not subfolders, not NPCs). */
export function partyOf(campaign: any): PartyMember[] {
  const flags = campaignFlags(campaign);
  const folder = flags.partyFolder ? game.folders.get(flags.partyFolder) : null;
  if (!folder) return [];
  return folder.contents
    .filter((a: any) => a.type === "character")
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
    .map((actor: any) => ({ actor, present: !flags.absent.includes(actor.id), level: actor.system.details?.level ?? 0 }));
}

export const presentLevels = (campaign: any): number[] =>
  partyOf(campaign).filter(m => m.present).map(m => m.level);

export async function togglePresent(campaign: any, actorId: string): Promise<void> {
  const absent = new Set(campaignFlags(campaign).absent);
  if (absent.has(actorId)) absent.delete(actorId);
  else absent.add(actorId);
  await campaign.setFlag(MODULE_ID, "absent", [...absent]);
}

/** Every world Actors folder, shown with its path ("Parties / Tuesday group"). */
export function actorFolderChoices(): Record<string, string> {
  const path = (f: any): string => (f.folder ? `${path(f.folder)} / ${f.name}` : f.name);
  const entries = game.folders.filter((f: any) => f.type === "Actor").map((f: any) => [f.id, path(f)] as [string, string]);
  entries.sort((a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]));
  return Object.fromEntries([["", "— none —"], ...entries]);
}
