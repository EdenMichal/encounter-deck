/**
 * Present PCs join the fight without tokens (ADR 0002). When a player rolls initiative from the tracker or their
 * sheet, dnd5e calls Actor#rollInitiative({ createCombatants: true }), and for an actor with no token Foundry adds a
 * new combatant every time (client/documents/actor.mjs, rollInitiative), even though one is already there. Block
 * that duplicate on every client, so the roll lands on the existing combatant instead.
 */
export function preventTokenlessDuplicates(): void {
  Hooks.on("preCreateCombatant", (combatant: any) => {
    const combat = combatant.parent;
    if (!combat || combatant.tokenId || !combatant.actorId) return;
    const already = combat.combatants.some((c: any) => c.actorId === combatant.actorId && !c.tokenId);
    if (already) return false;
  });
}
