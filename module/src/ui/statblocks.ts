/**
 * Stat Blocks: a monster's own dnd5e sheet, opened in one fixed spot beside the sidebar and replacing the previous
 * one. The tracker's book button and a double-click on a monster row open it; Next or Previous Turn opens the monster
 * whose turn it is (PC turns leave it alone). Finishing the fight closes it.
 */

const GAP = 8;

/** Monsters get stat blocks; player characters don't. */
export const isMonster = (combatant: any): boolean => !!combatant?.actor && combatant.actor.type === "npc";

/** The sheet we opened, and the combatant and combat it belongs to, so the next one can replace it. */
let shown: { sheet: any; combatantId: string; combatId: string } | null = null;

export function startStatBlocks(): void {
  if (!game.user.isGM) return;
  Hooks.on("updateCombat", (combat: any, changed: any) => {
    const turnChanged = "turn" in changed || "round" in changed;
    if (turnChanged && combat.started && combat === ui.combat?.viewed && isMonster(combat.combatant)) {
      showStatBlock(combat.combatant);
    }
  });
  Hooks.on("deleteCombat", (combat: any) => { if (shown?.combatId === combat.id) closeStatBlock(); });
}

/** Open a monster's sheet in the fixed spot. With `toggle`, opening the one already shown closes it instead. */
export async function showStatBlock(combatant: any, { toggle = false } = {}): Promise<void> {
  const sheet = combatant?.actor?.sheet;
  if (!sheet) return;
  if (toggle && shown && shown.combatantId === combatant.id && shown.sheet === sheet && sheet.rendered) return closeStatBlock();
  if (shown && shown.sheet !== sheet && shown.sheet.rendered) shown.sheet.close();
  shown = { sheet, combatantId: combatant.id, combatId: combatant.parent.id };
  await sheet.render({ force: true, position: spotFor(sheet) });
  sheet.bringToFront?.();
}

export function closeStatBlock(): void {
  if (shown?.sheet.rendered) shown.sheet.close();
  shown = null;
}

/** The fixed spot: near the top, just left of the sidebar, or of the floating combat tracker when that's open. */
function spotFor(sheet: any): { left: number; top: number } {
  const width = Number(sheet.position?.width) || Number(sheet.options?.position?.width) || 600;
  const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
  let edge = sidebar?.left ?? window.innerWidth;
  const popout = ui.combat?.popout;
  if (popout?.rendered && !popout.minimized) {
    const r = popout.element.getBoundingClientRect();
    if (r.width && r.left < edge) edge = r.left;
  }
  // Below the carousel while it shows, so the sheet never covers the turn order.
  const carousel = document.getElementById("encounter-deck-carousel");
  const below = carousel && !carousel.classList.contains("ed-hidden") ? carousel.getBoundingClientRect().bottom + GAP : 0;
  return { left: Math.max(GAP, edge - GAP - width), top: Math.max(60, Math.round(below)) };
}
