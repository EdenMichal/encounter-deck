/**
 * The Party Bar: the Active Campaign's Present PCs in a small bar the GM can drag anywhere, with their AC, passive
 * scores, HP, spell save DC and Inspiration, whatever scene is up and whether they have tokens or not. Its Request
 * Roll button posts dnd5e's own request card (the one a Group actor's skill request makes), so each PC rolls from
 * their own Roll button, and the GM can press any of them for a player who's away. GM only.
 *
 * Monk's TokenBar does something similar from the tokens on the scene; this takes the idea, not its code.
 */
import { CHANGED_HOOK, PARTY_BAR_HOOK, T } from "../constants";
import { activeCampaign, campaignFlags, partyOf, togglePresent, type PartyMember } from "../campaigns";
import {
  CHECK_HANDLER, EMPTY_HINTS, SAVE_HANDLER, STATS, buildEntries, clampPosition, parseDc, parseRollChoice, partyState,
  requestMessageData, rollGroups, spellDcOf, startPosition, statToggles, type MemberInput, type RollChoice,
} from "../party-bar-model";
import { setSetting, setting } from "../settings";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const esc = (s: string) => foundry.utils.escapeHTML(String(s ?? ""));
const MONK = "monks-tokenbar";

let instance: PartyBar | null = null;

/** The last roll asked for this session, so a repeat request is two clicks. */
const lastRoll = { value: "skill:prc", dc: "" };

/* -------------------------------------------- */
/*  Roll request handlers (every client)        */
/* -------------------------------------------- */

/**
 * dnd5e runs a request's handler on the client of whoever presses a Roll button (the player, or the GM for them).
 * It has one for skills; these two do ability checks and saving throws the same way, so they must be registered on
 * every client. The result message carries dnd5e's requestResult flag, which links it back to the card.
 */
export function registerRollRequests(): void {
  const requests = CONFIG.DND5E?.requests;
  if (!requests) return;
  const handler = (method: "rollAbilityCheck" | "rollSavingThrow") =>
    async (actor: any, request: any, config: any, { event }: { event?: Event } = {}) => {
      const data = {};
      foundry.utils.setProperty(data, "flags.dnd5e.requestResult", { actorUuid: actor.uuid, requestId: request.id });
      const [roll] = (await actor[method]({ ...config, event }, {}, { data })) ?? [];
      return roll?.parent ?? null;
    };
  requests[CHECK_HANDLER] = handler("rollAbilityCheck");
  requests[SAVE_HANDLER] = handler("rollSavingThrow");
}

/* -------------------------------------------- */
/*  Start                                       */
/* -------------------------------------------- */

export function startPartyBar(): void {
  if (!game.user.isGM) return;
  instance = new PartyBar();
  instance.render({ force: true });
  const refresh = foundry.utils.debounce(() => instance?.render(), 100);
  // The Active Campaign, its Party Folder, Present toggles and actors moving into or out of the folder (store.ts
  // watchChanges), the bar's own settings, and the scene.
  for (const hook of [CHANGED_HOOK, PARTY_BAR_HOOK, "canvasReady"]) Hooks.on(hook, refresh);
  // AC moves with armour and effects, HP and Inspiration with the actor. A monster's damage mid-fight doesn't count.
  for (const hook of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, (doc: any) => { if (pcOf(doc)) refresh(); });
  }
  window.addEventListener("resize", foundry.utils.debounce(() => instance?.place(), 100));
}

/** The world PC a changed actor, item or effect (on the actor or one of its items) belongs to, if any. */
function pcOf(doc: any): any {
  for (let d = doc, i = 0; d && i < 3; d = d.parent, i++) {
    if (d.documentName === "Actor") return d.type === "character" && !d.pack ? d : null;
  }
  return null;
}

/* -------------------------------------------- */
/*  The bar                                     */
/* -------------------------------------------- */

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function inputOf(actor: any): MemberInput {
  const system = actor.system ?? {};
  const attr = system.attributes ?? {};
  const hp = attr.hp;
  const dcs: Record<string, number> = {};
  for (const [key, ability] of Object.entries<any>(system.abilities ?? {})) if (Number.isFinite(ability?.dc)) dcs[key] = ability.dc;
  return {
    id: actor.id,
    name: actor.name,
    img: actor.img || CONST.DEFAULT_TOKEN,
    ac: num(attr.ac?.value),
    passives: { prc: num(system.skills?.prc?.passive), inv: num(system.skills?.inv?.passive), ins: num(system.skills?.ins?.passive) },
    hp: hp ? { value: num(hp.value) ?? 0, max: num(hp.max) ?? 0, temp: num(hp.temp) ?? 0, tempmax: num(hp.tempmax) ?? 0 } : null,
    spellDc: spellDcOf({
      ability: attr.spellcasting ?? "",
      classAbilities: Object.values<any>(actor.spellcastingClasses ?? {}).map(c => c.spellcasting?.ability).filter(Boolean),
      spells: actor.itemTypes?.spell?.length ?? 0,
      dc: num(attr.spell?.dc),
      dcs,
    }),
    inspiration: !!attr.inspiration,
  };
}

/** The Active Campaign's party, and why the bar is empty if it is. */
function party(): { members: PartyMember[]; hint: string | null } {
  const campaign = activeCampaign();
  const folderId = campaign ? campaignFlags(campaign).partyFolder : null;
  const members = campaign ? partyOf(campaign) : [];
  const state = partyState({
    campaign: !!campaign, folder: !!(folderId && game.folders.get(folderId)), members: members.length,
    present: members.filter(m => m.present).length,
  });
  return { members, hint: state === "ok" ? null : EMPTY_HINTS[state] };
}

const actorOf = (target: HTMLElement): any => game.actors.get(target.closest<HTMLElement>("[data-actor-id]")?.dataset.actorId);

class PartyBar extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-deck-party-bar",
    tag: "section",
    // The core "fade the UI" look (faded-ui), as the players list and hotbar have, is added on render unless pinned.
    classes: ["encounter-deck", "ed-party-bar"],
    window: { frame: false, positioned: false },
    actions: {
      // The second click of a double-click opens the sheet (see _onFirstRender), so it doesn't pan again.
      edPartyFocus: (event: MouseEvent, target: HTMLElement) => { if (event.detail < 2) focusToken(actorOf(target)); },
      edPartyInspiration: (_event: Event, target: HTMLElement) => toggleInspiration(actorOf(target)),
      edPartyRequest: () => requestRoll(),
      edPartyStats: () => editStats(),
      edPartyPin: () => setSetting("partyBarPinned", !setting("partyBarPinned")),
      edPartyCollapse: () => setSetting("partyBarCollapsed", !setting("partyBarCollapsed")),
    },
  };

  static PARTS = { bar: { template: T("party-bar") } };

  async _insertElement(element: HTMLElement) {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (document.getElementById("interface") ?? document.body).append(element);
  }

  async _prepareContext() {
    const show = !!setting("showPartyBar");
    if (!show) return { show };
    const { members, hint } = party();
    const present = members.filter(m => m.present).map(m => m.actor);
    const entries = buildEntries(present.map(inputOf), statToggles(setting("partyBarStats"))).map(e => ({
      ...e,
      showInspiration: e.inspiration !== null,
      tooltip: `${esc(e.name)}${e.hp ? `<br>${esc(e.hp.text)}` : ""}`,
    }));
    return { show, collapsed: !!setting("partyBarCollapsed"), pinned: !!setting("partyBarPinned"), entries, hint, canRequest: members.length > 0 };
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options);
    this.element.classList.toggle("ed-hidden", !context.show);
    // Pinned, the bar stays solid; otherwise it fades with the rest of the UI until hovered.
    this.element.classList.toggle("faded-ui", !context.pinned);
    this.place();
  }

  /** Put the bar where it belongs (see startPosition), kept on screen. */
  place(): void {
    const el = this.element as HTMLElement | undefined;
    // While the GM is dragging it, the drag decides where it is: a render mustn't snap it back.
    if (!el || el.classList.contains("ed-hidden") || el.classList.contains("ed-pb-moving")) return;
    const players = document.getElementById("players")?.getBoundingClientRect();
    const pos = startPosition({
      saved: setting("partyBarPosition"),
      // Read the flag directly: getFlag throws for a module that isn't active.
      monk: game.user.flags?.[MONK]?.position,
      players: players?.height ? { left: players.left, top: players.top } : null,
      size: { width: el.offsetWidth, height: el.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
  }

  async _onFirstRender(context: any, options: any) {
    await super._onFirstRender(context, options);
    const el: HTMLElement = this.element;
    this.bindGrip(el);
    el.addEventListener("dblclick", (event: MouseEvent) => {
      const portrait = (event.target as HTMLElement).closest<HTMLElement>(".ed-pb-portrait");
      if (portrait) actorOf(portrait)?.sheet.render({ force: true });
    });
    // A PC drags as its Actor: onto the canvas for a token, or onto the running fight's tracker.
    el.addEventListener("dragstart", (event: DragEvent) => {
      const actor = actorOf(event.target as HTMLElement);
      if (!actor || !event.dataTransfer) return;
      event.dataTransfer.setData("text/plain", JSON.stringify(actor.toDragData()));
      event.dataTransfer.effectAllowed = "copy";
    });
    new foundry.applications.ux.ContextMenu.implementation(el, ".ed-pb-member", this.memberMenu(), { jQuery: false, fixed: true });
  }

  memberMenu(): any[] {
    const inspired = (li: HTMLElement) => !!actorOf(li)?.system?.attributes?.inspiration;
    return [
      { label: "Open sheet", icon: "fa-solid fa-user", onClick: (_e: Event, li: HTMLElement) => actorOf(li)?.sheet.render({ force: true }) },
      { label: "Request a roll…", icon: "fa-solid fa-dice-d20", onClick: (_e: Event, li: HTMLElement) => requestRoll(actorOf(li)?.id) },
      { label: "Give Inspiration", icon: "fa-solid fa-star", visible: (li: HTMLElement) => !inspired(li),
        onClick: (_e: Event, li: HTMLElement) => toggleInspiration(actorOf(li)) },
      { label: "Remove Inspiration", icon: "fa-regular fa-star", visible: (li: HTMLElement) => inspired(li),
        onClick: (_e: Event, li: HTMLElement) => toggleInspiration(actorOf(li)) },
      { label: "Mark absent", icon: "fa-solid fa-user-slash", onClick: (_e: Event, li: HTMLElement) => {
        const campaign = activeCampaign(), actor = actorOf(li);
        if (campaign && actor) togglePresent(campaign, actor.id);
      } },
    ];
  }

  /** Drag the bar by its grip; the spot is saved for this client when the drag ends. */
  bindGrip(el: HTMLElement): void {
    el.addEventListener("pointerdown", (event: PointerEvent) => {
      const grip = (event.target as HTMLElement).closest<HTMLElement>(".ed-pb-grip");
      if (!grip || event.button !== 0) return;
      event.preventDefault();
      const box = el.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      // The last spot the drag put the bar, saved when it ends (a cancelled pointer carries no position to trust).
      let last: { left: number; top: number } | null = null;
      const move = (e: PointerEvent) => {
        last = clampPosition(
          { left: start.left + e.clientX - start.x, top: start.top + e.clientY - start.y },
          { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight },
        );
        el.style.left = `${last.left}px`;
        el.style.top = `${last.top}px`;
      };
      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        el.classList.remove("ed-pb-moving");
        if (last) setSetting("partyBarPosition", last);
      };
      // Capture on the bar itself, not the grip: a render mid-drag replaces the grip, and the drag has to outlive it.
      el.setPointerCapture(event.pointerId);
      el.classList.add("ed-pb-moving");
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    });
  }
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/** Select the PC's token on the scene you're viewing and pan to it, as a Carousel card does. */
function focusToken(actor: any): void {
  const token = actor?.getActiveTokens?.()[0];
  if (!token) return;
  token.control({ releaseOthers: true });
  canvas.animatePan({ x: token.center.x, y: token.center.y });
}

async function toggleInspiration(actor: any): Promise<void> {
  if (!actor?.system?.attributes || !("inspiration" in actor.system.attributes)) return;
  await actor.update({ "system.attributes.inspiration": !actor.system.attributes.inspiration });
}

/** The gear button: which stats the bar shows, for this client. */
async function editStats(): Promise<void> {
  const current = statToggles(setting("partyBarStats"));
  const rows = STATS.map(s => `<label class="ed-pb-check"><input type="checkbox" name="${s.key}" ${current[s.key] ? "checked" : ""}> ${esc(s.label)}</label>`).join("");
  const result = await DialogV2.prompt({
    window: { title: "Party Bar", icon: "fa-solid fa-gear" },
    classes: ["encounter-deck", "ed-pb-dialog"],
    content: `<p class="hint">What each PC on the bar shows (for you only).</p><div class="ed-pb-checks">${rows}</div>`,
    ok: {
      label: "Save", icon: "fa-solid fa-check",
      callback: (_event: Event, button: HTMLButtonElement) =>
        Object.fromEntries(STATS.map(s => [s.key, !!(button.form!.elements.namedItem(s.key) as HTMLInputElement | null)?.checked])),
    },
    rejectClose: false,
  }).catch(() => null);
  if (result) await setSetting("partyBarStats", result);
}

/** The roll's title, as dnd5e words it ("Wisdom (Perception) Check", "Dexterity Saving Throw"). */
function rollTitle(choice: RollChoice): string {
  const { skills, abilities } = CONFIG.DND5E;
  if (choice.kind === "skill") {
    const skill = skills[choice.key];
    return game.i18n.format("DND5E.SkillPromptTitle", { skill: skill?.label ?? choice.key, ability: abilities[skill?.ability]?.label ?? "" });
  }
  const ability = abilities[choice.key]?.label ?? choice.key;
  return game.i18n.format(choice.kind === "check" ? "DND5E.AbilityPromptTitle" : "DND5E.SavePromptTitle", { ability });
}

/**
 * Request Roll: pick PCs (the Present ones ticked, or just `only`), a skill, ability check or save, an optional DC
 * and an optional line of flavour, then post one dnd5e request card for them.
 */
async function requestRoll(only?: string): Promise<void> {
  const campaign = activeCampaign();
  const members = campaign ? partyOf(campaign) : [];
  if (!members.length) return void ui.notifications.warn("No party: link a Party Folder to the Active Campaign.");
  const picks = members.map(({ actor, present }) => {
    const ticked = only ? actor.id === only : present;
    return `<label class="ed-pb-pick" data-tooltip-text="${esc(actor.name)}${present ? "" : " (absent)"}">
      <input type="checkbox" name="pc" value="${esc(actor.id)}" ${ticked ? "checked" : ""}>
      <img src="${esc(actor.img || CONST.DEFAULT_TOKEN)}" alt=""><span>${esc(actor.name)}</span></label>`;
  }).join("");
  const groups = rollGroups(CONFIG.DND5E.skills, CONFIG.DND5E.abilities).map(g => `<optgroup label="${esc(g.label)}">${
    g.options.map(o => `<option value="${esc(o.value)}" ${o.value === lastRoll.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")
  }</optgroup>`).join("");
  const result = await DialogV2.prompt({
    window: { title: "Request a Roll", icon: "fa-solid fa-dice-d20" },
    classes: ["encounter-deck", "ed-pb-dialog"],
    position: { width: 440 },
    content: `
      <fieldset class="ed-pb-picks"><legend>Who rolls</legend>${picks}</fieldset>
      <div class="form-group"><label>Roll</label><div class="form-fields"><select name="roll">${groups}</select></div></div>
      <div class="form-group"><label>DC</label><div class="form-fields"><input type="number" name="dc" min="1" step="1" placeholder="None" value="${esc(lastRoll.dc)}"></div></div>
      <div class="form-group"><label>Flavour</label><div class="form-fields"><input type="text" name="flavor" placeholder="Optional: what the roll is for"></div></div>`,
    ok: {
      label: "Request", icon: "fa-solid fa-dice-d20",
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.form!;
        const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
        const ids = [...form.querySelectorAll<HTMLInputElement>('input[name="pc"]:checked')].map(i => i.value);
        return { ids, roll: value("roll"), dc: value("dc"), flavor: value("flavor") };
      },
    },
    rejectClose: false,
  }).catch(() => null);
  if (!result) return;
  const choice = parseRollChoice(result.roll);
  if (!choice) return;
  lastRoll.value = result.roll;
  lastRoll.dc = result.dc;
  const targets = members.filter(m => result.ids.includes(m.actor.id)).map(m => m.actor.uuid);
  if (!targets.length) return void ui.notifications.warn("Pick at least one PC to roll.");
  const data = requestMessageData({ choice, title: rollTitle(choice), dc: parseDc(result.dc), flavor: result.flavor, targets });
  await CONFIG.ChatMessage.documentClass.create({ ...data, speaker: { alias: game.user.name } });
}

/* -------------------------------------------- */
/*  Monk's TokenBar                             */
/* -------------------------------------------- */

/**
 * Monk's TokenBar draws its own bar from the scene's tokens, so the GM would see two. Ask once (per client, since
 * Monk's setting is per client) whether to turn its bar off. "Disable Tokenbar" only skips drawing the bar: its loot
 * dialog, XP dialog and roll requests keep working. Foundry needs a reload for it to take effect.
 */
export async function checkMonkBar(): Promise<void> {
  if (!game.modules.get(MONK)?.active || setting("monkBarAsked") || !setting("showPartyBar")) return;
  let disabled = true;
  try { disabled = !!game.settings.get(MONK, "disable-tokenbar"); } catch { return; }
  if (disabled) return void setSetting("monkBarAsked", true);
  const turnOff = await DialogV2.confirm({
    window: { title: "Encounter Deck" },
    content: `<p>Encounter Deck now has a Party Bar: the Active Campaign's Present PCs with their AC and passive scores, and a button to request rolls. Monk's TokenBar shows its own bar too.</p>
      <p>Turn off Monk's TokenBar's bar on this computer? Its loot dialog and XP features keep working, and the Party Bar starts where its bar was. Foundry will ask to reload this window. You won't be asked again.</p>`,
    yes: { label: "Turn it off", icon: "fa-solid fa-power-off" },
    no: { label: "Keep both" },
    rejectClose: false,
  }).catch(() => false);
  await setSetting("monkBarAsked", true);
  if (!turnOff) return;
  await game.settings.set(MONK, "disable-tokenbar", true);
  foundry.applications.settings.SettingsConfig.reloadConfirm({ world: false });
}
