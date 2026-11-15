/**
 * Finish: what happens when the GM ends the fight with Foundry's own "End combat" confirmation (the combat is
 * deleted). If the fight began, each imported Encounter is marked Completed and, in XP mode, its full XP is split
 * between the present PCs and announced in chat. Either way, everything Import added is removed.
 */
import { MODULE_ID } from "./constants";
import { advancementOf, partyOf } from "./campaigns";
import { splitXp } from "./fight";
import { combatFlags, importedFolders, type ImportRecord } from "./importer";
import { setting, setSetting } from "./settings";
import { folderById, getEncounter } from "./store";

export function startFinish(): void {
  Hooks.on("deleteCombat", (combat: any, _options: any, userId: string) => {
    if (userId !== game.user.id || !game.user.isGM) return;
    finish(combat).catch((err: unknown) => {
      console.error("Encounter Deck | Finish failed", err);
      ui.notifications.error("Encounter Deck could not finish the fight cleanly. See the console for details.");
    });
  });
}

async function finish(combat: any): Promise<void> {
  const { imports } = combatFlags(combat);
  // A fight that never began earns nothing and stays Ready, but its tokens and actors still go.
  if (imports.length && combat.round > 0) {
    await markCompleted(imports);
    await awardXp(imports);
  }
  await removeImported(combat.id);
}

async function markCompleted(imports: ImportRecord[]): Promise<void> {
  for (const id of new Set(imports.map(i => i.encounterId))) {
    const doc = await getEncounter(id).catch(() => null);
    await doc?.update({ [`flags.${MODULE_ID}.status`]: "completed" });
  }
}

/** Every Import's full XP (defeated or not), per Campaign, split between that Campaign's present PCs. */
async function awardXp(imports: ImportRecord[]): Promise<void> {
  const byCampaign = new Map<string, ImportRecord[]>();
  for (const record of imports) {
    if (!record.campaignId) continue;
    byCampaign.set(record.campaignId, [...(byCampaign.get(record.campaignId) ?? []), record]);
  }
  for (const [campaignId, records] of byCampaign) {
    const campaign = folderById(campaignId);
    if (!campaign || advancementOf(campaign) !== "xp") continue;
    const present = partyOf(campaign).filter(m => m.present).map(m => m.actor);
    const total = records.reduce((xp, r) => xp + r.xp, 0);
    const each = splitXp(total, present.length);
    if (!each) continue;
    for (const actor of present) {
      await actor.update({ "system.details.xp.value": (actor.system.details?.xp?.value ?? 0) + each });
    }
    const names = [...new Set(records.map(r => r.name))].join(", ");
    await CONFIG.ChatMessage.documentClass.create({
      speaker: { alias: "Encounter Deck" },
      content: `<p><strong>${foundry.utils.escapeHTML(names)}</strong>: ${present.length === 1 ? "the party gains" : `each of ${present.length} PCs gains`} <strong>${each} XP</strong>.</p>`,
    });
  }
}

/** Remove this fight's imported tokens, then any imported actor no remaining token needs. */
async function removeImported(combatId: string): Promise<void> {
  for (const scene of game.scenes) {
    const ids = scene.tokens.filter((t: any) => t.flags?.[MODULE_ID]?.combat === combatId).map((t: any) => t.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
  }
  const folders = importedFolders();
  if (!folders.length) return;
  const inUse = new Set<string>();
  for (const scene of game.scenes) for (const t of scene.tokens) if (t.actorId) inUse.add(t.actorId);
  const unused = folders.flatMap(f => f.contents).filter((a: any) => !inUse.has(a.id)).map((a: any) => a.id);
  if (unused.length) await CONFIG.Actor.documentClass.deleteDocuments(unused);
  for (const folder of folders) if (!folder.contents.length) await folder.delete();
}

/**
 * Monk's TokenBar can show its own XP dialog when a fight ends, which would award XP twice. Ask once whether to
 * turn it off.
 */
export async function checkTokenBar(): Promise<void> {
  if (!game.modules.get("monks-tokenbar")?.active || setting("tokenBarAsked")) return;
  let on = false;
  try { on = !!game.settings.get("monks-tokenbar", "show-xp-dialog"); } catch { return; }
  if (!on) return;
  const turnOff = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Encounter Deck" },
    content: `<p>Monk's TokenBar is set to show its XP dialog after every fight. Encounter Deck already awards XP when a fight ends, so the party would get it twice.</p><p>Turn off Monk's TokenBar's "Show XP Dialog"?</p>`,
    rejectClose: false,
  }).catch(() => false);
  await setSetting("tokenBarAsked", true);
  if (turnOff) await game.settings.set("monks-tokenbar", "show-xp-dialog", false);
}
