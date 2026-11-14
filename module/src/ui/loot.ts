/**
 * Distribute Loot. When a fight ends, Monk's TokenBar gathers the defeated monsters' loot into its "Distribute
 * Lootables" dialog, whose button only creates a new lootable. Encounter Deck turns that button into Distribute
 * Loot, which gives the loot to the party:
 *
 * - With Mobile Deck active and a party inventory (a dnd5e Group: the primary party, or a Group a Present PC is in),
 *   every item and coin goes into the Group.
 * - Otherwise the GM picks who gets each item (pre-filled so the Present PCs take turns), the coins are split evenly
 *   between the Present PCs, and the leftover coins go to one of them.
 *
 * Either way, one chat line says who got what. TokenBar's own list stays editable until the button is pressed.
 */
import { MODULE_ID } from "../constants";
import { activeCampaign, partyOf } from "../campaigns";
import { combatFlags } from "../importer";
import {
  addCoins, cleanCoins, coinText, collectLoot, hasCoins, itemToGive, shareText, splitCoins, stackTarget, takeTurns,
  type Coins, type LootItem,
} from "../loot";
import { folderById } from "../store";

const { DialogV2 } = foundry.applications.api;
const esc = (s: string) => foundry.utils.escapeHTML(String(s ?? ""));
const MOBILE_DECK = ["mobile-deck", "mobile-deck-dev"];

export function startLoot(): void {
  if (!game.user.isGM) return;
  Hooks.on("renderLootablesApp", (app: any, element: HTMLElement) => takeOver(app, element));
}

const mobileDeckActive = () => MOBILE_DECK.some(id => game.modules.get(id)?.active);

/** The Present PCs the loot is for: the fight's Campaign, else the Active Campaign, else the PCs in the fight. */
function lootPcs(combat: any): any[] {
  const campaignId = combatFlags(combat).imports.find(r => r.campaignId)?.campaignId;
  const campaign = folderById(campaignId) ?? activeCampaign();
  const present = campaign ? partyOf(campaign).filter(m => m.present).map(m => m.actor) : [];
  if (present.length) return present;
  return (combat?.combatants?.contents ?? []).map((c: any) => c.actor).filter((a: any) => a?.type === "character" && a.hasPlayerOwner);
}

const memberIds = (group: any): string[] =>
  (group?.system?.members ?? []).map((m: any) => m?.actor?.id ?? m?.id ?? m).filter(Boolean);

/**
 * The party inventory, as Mobile Deck uses it: dnd5e's primary party, or else a Group one of these PCs is in.
 * Only with Mobile Deck active.
 */
function partyInventory(pcs: any[]): any | null {
  if (!mobileDeckActive()) return null;
  let primary: any = null;
  try { primary = game.settings.get("dnd5e", "primaryParty")?.actor ?? null; } catch { primary = null; }
  if (primary?.type === "group") return primary;
  const ids = new Set(pcs.map(a => a.id));
  return game.actors.find((a: any) => a.type === "group" && memberIds(a).some(id => ids.has(id))) ?? null;
}

/** Turn TokenBar's button into Distribute Loot and hide its lootable options, which no longer apply. */
function takeOver(app: any, element: HTMLElement): void {
  const button = element.querySelector<HTMLElement>('[data-action="assignLoot"]');
  if (!button) return;
  element.classList.add("ed-loot");
  const pcs = lootPcs(app.combat);
  const party = partyInventory(pcs);
  button.innerHTML = `<i class="fa-solid fa-hand-holding-heart" inert></i> <span>Distribute Loot</span>`;
  button.dataset.tooltip = party ? `Put everything into ${party.name}` : "Choose who gets each item; coins are split evenly";
  if (!button.dataset.edLoot) {
    button.dataset.edLoot = "1";
    // Ahead of TokenBar's own click handler (on the window), which would create a lootable instead.
    button.addEventListener("click", (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      distribute(app).catch((err: unknown) => {
        console.error("Encounter Deck | Distribute Loot failed", err);
        ui.notifications.error("Encounter Deck could not distribute the loot. See the console for details.");
      });
    }, { capture: true });
  }
  const content = element.querySelector(".dialog-content");
  if (content && !content.querySelector(".ed-loot-note")) {
    const who = party ? `the party inventory, <strong>${esc(party.name)}</strong>` : pcs.length
      ? `the Present PCs (${pcs.map(a => esc(a.name)).join(", ")})` : "the PCs in the fight";
    content.insertAdjacentHTML("afterbegin", `<p class="ed-loot-note"><i class="fa-solid fa-hand-holding-heart" inert></i> Encounter Deck gives this loot to ${who}.</p>`);
  }
}

/** TokenBar keeps edits on blur; read the boxes as they are now, and roll dice quantities as TokenBar would. */
async function readLoot(app: any): Promise<{ loot: LootItem[]; coins: Coins }> {
  const element: HTMLElement = app.element;
  for (const input of element.querySelectorAll<HTMLInputElement>(".loot-item-quantity")) {
    const entryId = input.closest<HTMLElement>(".entry")?.dataset.entryId;
    const itemId = input.closest<HTMLElement>(".item")?.dataset.itemId;
    const item = app.entries?.find((e: any) => e.id == entryId)?.items?.find((i: any) => i.id == itemId);
    if (item) item.quantity = input.value;
  }
  for (const input of element.querySelectorAll<HTMLInputElement>(".currency-value")) app.currency[input.name] = input.value;
  for (const entry of app.entries ?? []) {
    for (const item of entry.items ?? []) {
      if (typeof item.quantity === "string" && /d/i.test(item.quantity)) {
        try { item.quantity = (await new foundry.dice.Roll(item.quantity).evaluate()).total; } catch { item.quantity = 1; }
      }
    }
  }
  return { loot: collectLoot(app.entries ?? []), coins: cleanCoins(app.currency ?? {}) };
}

async function distribute(app: any): Promise<void> {
  const { loot, coins } = await readLoot(app);
  if (!loot.length && !hasCoins(coins)) return void ui.notifications.warn("There's no loot to distribute.");
  const pcs = lootPcs(app.combat);
  const party = partyInventory(pcs);

  if (party) {
    await give(party, loot.map(item => ({ item, quantity: item.quantity })), coins);
    await announce([shareText(party.name, loot, coins)]);
    ui.notifications.info(`Put the loot into ${party.name}.`);
    return void app.close();
  }

  if (!pcs.length) return void ui.notifications.warn("No Present PCs to give the loot to.");
  const plan = await pickWhoGetsWhat(loot, coins, pcs);
  if (!plan) return;
  const { each, leftover } = splitCoins(coins, pcs.length);
  const lines: string[] = [];
  for (const pc of pcs) {
    const mine = loot.filter(item => plan.items[item.key] === pc.id);
    const purse: Coins = { ...each };
    if (plan.leftover === pc.id) for (const [k, v] of Object.entries(leftover)) purse[k] = (purse[k] ?? 0) + (v ?? 0);
    await give(pc, mine.map(item => ({ item, quantity: item.quantity })), purse);
    lines.push(shareText(pc.name, mine, purse));
  }
  await announce(lines);
  ui.notifications.info("Loot distributed.");
  app.close();
}

/** The pick dialog: each item with a PC dropdown (taking turns to start), the coin split, and who gets the leftover. */
async function pickWhoGetsWhat(loot: LootItem[], coins: Coins, pcs: any[]): Promise<{ items: Record<string, string>; leftover: string } | null> {
  const turns = takeTurns(loot, pcs.map(a => a.id));
  const { each, leftover } = splitCoins(coins, pcs.length);
  const options = (selected: string) => pcs.map(a => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const rows = loot.map((item, i) => `
    <div class="form-group ed-loot-row">
      <label><img src="${esc(item.img)}" alt=""> ${item.quantity > 1 ? `${item.quantity}× ` : ""}${esc(item.name)}</label>
      <div class="form-fields"><select name="item${i}">${options(turns[item.key])}</select></div>
    </div>`).join("");
  const coinRows = hasCoins(coins) ? `
    <p class="ed-loot-coins">Coins: ${esc(coinText(coins))}${coinText(each) ? ` → <strong>${esc(coinText(each))}</strong> each` : ""}</p>
    ${coinText(leftover) ? `<div class="form-group"><label>Leftover (${esc(coinText(leftover))}) to</label>
      <div class="form-fields"><select name="leftover">${options(pcs[0].id)}</select></div></div>` : ""}` : "";
  const result = await DialogV2.prompt({
    window: { title: "Distribute Loot", icon: "fa-solid fa-hand-holding-heart" },
    classes: ["encounter-deck", "ed-loot-dialog"],
    position: { width: 520 },
    content: `<div class="ed-loot-pick">${rows || "<p>No items, only coins.</p>"}${coinRows}</div>`,
    ok: {
      label: "Distribute", icon: "fa-solid fa-check",
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.form!;
        const value = (name: string) => (form.elements.namedItem(name) as HTMLSelectElement | null)?.value ?? "";
        return { items: Object.fromEntries(loot.map((item, i) => [item.key, value(`item${i}`)])), leftover: value("leftover") || pcs[0].id };
      },
    },
    rejectClose: false,
  }).catch(() => null);
  return result ?? null;
}

/** Items onto an actor (stacking onto ones it already has), then its coins. */
async function give(actor: any, items: { item: LootItem; quantity: number }[], coins: Coins): Promise<void> {
  const create: object[] = [];
  for (const { item, quantity } of items) {
    if (quantity <= 0) continue;
    const data = itemToGive(item.data, quantity);
    const target = stackTarget(actor.items.contents, data);
    if (target) await target.update({ "system.quantity": (Number(target.system.quantity) || 0) + quantity });
    else create.push(data);
  }
  if (create.length) await actor.createEmbeddedDocuments("Item", create);
  if (hasCoins(coins)) {
    const sums = addCoins(actor.system?.currency ?? {}, coins);
    await actor.update(Object.fromEntries(Object.entries(sums).map(([k, v]) => [`system.currency.${k}`, v])));
  }
}

async function announce(lines: string[]): Promise<void> {
  await CONFIG.ChatMessage.documentClass.create({
    speaker: { alias: "Encounter Deck" },
    content: `<p><strong>Loot</strong></p><ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`,
    flags: { [MODULE_ID]: { loot: true } },
  });
}
