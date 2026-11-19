/** Render context for the encounter browser in the Combat tab. Built from the pack's index only. */
import { MODULE_ID, STATUS_LABELS, type EncounterFlags, type Status } from "../constants";
import { activeCampaign, advancementOf, partyOf } from "../campaigns";
import { BAND_LABELS, bandOf, partyBudget, type Budget } from "../difficulty";
import { readEntries, totalCount, totalXp } from "../entries";
import { setting } from "../settings";
import { lookupMonster } from "../sources";
import { campaignFolders, childFolders, depthOf, encountersIn, kindOf, libraryFolder, pack } from "../store";

export interface BrowserUi { query: string; openEncounter: string | null }

const fmt = (n: number) => new Intl.NumberFormat(game.i18n.lang).format(n);

export function partyContext(campaign: any) {
  const party = campaign ? partyOf(campaign) : [];
  const budget: Budget = partyBudget(party.filter(m => m.present).map(m => m.level), CONFIG.DND5E.ENCOUNTER_DIFFICULTY);
  return {
    budget,
    members: party.map(({ actor, present, level }) => ({ id: actor.id, name: actor.name, img: actor.img, level, present })),
    presentCount: party.filter(m => m.present).length,
    budgetText: budget.high ? `Low ${fmt(budget.low)} · Moderate ${fmt(budget.moderate)} · High ${fmt(budget.high)} XP` : "",
  };
}

export function browserContext(ui: BrowserUi) {
  if (!pack()) return { ready: false };
  const campaign = activeCampaign();
  const party = partyContext(campaign);
  const showCompleted = !!setting("showCompleted");
  const collapsed: Record<string, boolean> = setting("collapsedFolders") ?? {};
  const words = ui.query.toLowerCase().split(/\s+/).filter(Boolean);
  let hiddenCompleted = 0;

  const row = (e: any, isLibrary: boolean) => {
    const flags: EncounterFlags = e.flags?.[MODULE_ID] ?? {};
    const status: Status = flags.status ?? "draft";
    const entries = readEntries(e.system?.members ?? [], flags.entries ?? [], lookupMonster);
    const xp = totalXp(entries);
    const band = entries.length ? bandOf(xp, party.budget) : "empty";
    return {
      id: e._id, name: e.name, status, statusLabel: STATUS_LABELS[status], isLibrary,
      tags: flags.tags ?? [], count: totalCount(entries), xp: fmt(xp), band, bandLabel: BAND_LABELS[band],
      missing: entries.some(en => en.missing), linked: !!flags.link, inLair: !!flags.inLair, active: ui.openEncounter === e._id,
      summary: entries.map(en => `${en.name} ×${en.count}`).join(", "),
    };
  };
  const matches = (r: ReturnType<typeof row>) =>
    words.every(w => r.name.toLowerCase().includes(w) || r.tags.some(t => t.toLowerCase().includes(w)) || r.summary.toLowerCase().includes(w));

  const node = (folder: any, isLibrary: boolean): any => {
    // A Campaign's Completed folder only shows with "Show completed"; until then its Encounters just count as hidden.
    const shown = childFolders(folder.id).filter(f => {
      if (showCompleted || kindOf(f) !== "completed") return true;
      hiddenCompleted += encountersIn(f.id).length;
      return false;
    });
    const folders = shown.map(f => node(f, isLibrary)).filter(n => !words.length || n.hasContent);
    const encounters = encountersIn(folder.id).map(e => row(e, isLibrary)).filter(r => {
      if (r.status === "completed" && !showCompleted) { hiddenCompleted++; return false; }
      return matches(r);
    });
    const depth = depthOf(folder.id);
    const isCompleted = kindOf(folder) === "completed";
    return {
      id: folder.id, name: folder.name, isLibrary, isCompleted, root: depth === 1, depth,
      collapsed: !words.length && !!collapsed[folder.id],
      canNest: depth < CONST.FOLDER_MAX_DEPTH && !isCompleted,
      folders, encounters, hasContent: folders.length + encounters.length > 0,
    };
  };

  const library = libraryFolder();
  const campaignTree = campaign ? node(campaign, false) : null;
  const libraryTree = library ? node(library, true) : null;
  return {
    ready: true,
    campaigns: campaignFolders().map(f => ({ id: f.id, name: f.name, active: f.id === campaign?.id })),
    campaign: campaign ? { id: campaign.id, name: campaign.name, advancement: advancementOf(campaign) === "xp" ? "XP" : "Milestone" } : null,
    party,
    query: ui.query,
    showCompleted,
    hiddenCompleted,
    campaignTree,
    library: libraryTree,
  };
}
