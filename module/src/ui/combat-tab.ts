/**
 * The Combat tab. It subclasses whatever CONFIG.ui.combat is (dnd5e's CombatTracker5e) so Foundry's combat keeps
 * running underneath and ui.combat stays a real tracker. For the GM, the encounter browser replaces the tracker's
 * parts while no combat is viewed (PLAN.md "Combat tab"); players always get the vanilla tracker.
 */
import { CHANGED_HOOK, MODULE_ID, STATUSES, STATUS_LABELS, T, type Status } from "../constants";
import {
  activeCampaign, actorFolderChoices, campaignFlags, createCampaign, deleteCampaign, setActiveCampaign, togglePresent,
} from "../campaigns";
import { setSetting, setting } from "../settings";
import {
  copyEncounter, createEncounter, createFolder, deleteEncounter, deleteFolder, folderById, getEncounter,
  isInLibrary, kindOf, moveEncounter, pack, rootOf,
} from "../store";
import { parseHp } from "../fight";
import { importEncounter } from "../importer";
import { browserContext, type BrowserUi } from "./browser-model";
import { builder, openBuilder } from "./builder";
import { isMonster, showStatBlock } from "./statblocks";

const { DialogV2 } = foundry.applications.api;
const esc = (s: string) => foundry.utils.escapeHTML(s ?? "");
const DRAG_TYPE = "EncounterDeckEncounter";

type Handler = (this: any, event: Event, target: HTMLElement) => unknown;
const act = (fn: (app: any, target: HTMLElement, event: Event) => unknown): Handler =>
  function (this: any, event, target) { return fn(this, target, event); };
const folderOf = (t: HTMLElement) => t.closest<HTMLElement>("[data-folder-id]")!.dataset.folderId!;
const encounterOf = (t: HTMLElement) => t.closest<HTMLElement>("[data-encounter-id]")!.dataset.encounterId!;

export async function askName(title: string, label: string, value = ""): Promise<string | null> {
  const result = await DialogV2.input({
    window: { title },
    content: `<div class="form-group"><label>${esc(label)}</label><div class="form-fields"><input type="text" name="name" value="${esc(value)}" autofocus></div></div>`,
    ok: { label: "Save", icon: "fa-solid fa-check" },
    rejectClose: false,
  }).catch(() => null);
  const name = result?.name?.trim();
  return name || null;
}

async function confirmDelete(what: string): Promise<boolean> {
  return !!(await DialogV2.confirm({
    window: { title: "Delete" },
    content: `<p>Delete <strong>${esc(what)}</strong>? This can't be undone.</p>`,
    rejectClose: false,
  }).catch(() => false));
}

async function newCampaign(): Promise<void> {
  const name = await askName("New Campaign", "Campaign name");
  if (name) await createCampaign(name);
}

async function campaignSettings(): Promise<void> {
  const campaign = activeCampaign();
  if (!campaign) return newCampaign();
  const flags = campaignFlags(campaign);
  const options = (choices: Record<string, string>, selected: string) =>
    Object.entries(choices).map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`).join("");
  const worldMode = setting("defaultAdvancement") === "milestone" ? "Milestone" : "XP";
  const content = `
    <div class="form-group"><label>Name</label><div class="form-fields"><input type="text" name="name" value="${esc(campaign.name)}"></div></div>
    <div class="form-group"><label>Party Folder</label><div class="form-fields"><select name="partyFolder">${options(actorFolderChoices(), flags.partyFolder ?? "")}</select></div>
      <p class="hint">Only the player characters directly inside this Actors folder are the party.</p></div>
    <div class="form-group"><label>Advancement Mode</label><div class="form-fields"><select name="advancement">${options({ default: `World default (${worldMode})`, xp: "XP", milestone: "Milestone" }, flags.advancement)}</select></div></div>`;
  const choice = await DialogV2.wait({
    window: { title: `Campaign: ${campaign.name}` },
    position: { width: 420 },
    content,
    buttons: [
      { action: "save", label: "Save", icon: "fa-solid fa-check", default: true,
        callback: (_e: Event, button: any) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "delete", label: "Delete Campaign", icon: "fa-solid fa-trash" },
    ],
    rejectClose: false,
  }).catch(() => null);
  if (choice === "delete") {
    if (await confirmDelete(`${campaign.name} and every Encounter in it`)) await deleteCampaign(campaign.id);
    return;
  }
  if (!choice || typeof choice !== "object") return;
  await campaign.update({
    name: choice.name?.trim() || campaign.name,
    [`flags.${MODULE_ID}.partyFolder`]: choice.partyFolder || null,
    [`flags.${MODULE_ID}.advancement`]: choice.advancement || "default",
  });
}

async function newEncounter(folderId: string): Promise<void> {
  const name = await askName("New Encounter", "Encounter name", "New Encounter");
  if (!name) return;
  const doc = await createEncounter(folderId, name);
  if (doc) openBuilder(doc.id);
}

async function newFolder(parentId: string): Promise<void> {
  const name = await askName("New Folder", "Folder name");
  if (name) await createFolder(name, parentId);
}

/** Using a Master Copy copies it into the Active Campaign (or a folder in it) and opens the copy. */
async function useMaster(id: string, folderId?: string): Promise<void> {
  const target = folderId ?? activeCampaign()?.id;
  if (!target) return void ui.notifications.warn("Create a Campaign first.");
  const copy = await copyEncounter(id, target, { fromMaster: true });
  if (copy) {
    ui.notifications.info(`Copied "${copy.name}" into ${rootOf(target)?.name ?? "the Campaign"}.`);
    openBuilder(copy.id);
  }
}

export async function setStatus(id: string, status: Status): Promise<void> {
  const doc = await getEncounter(id);
  if (status === "completed" && isInLibrary(doc?.folder?.id ?? doc?._source.folder)) {
    return void ui.notifications.warn("A Master Copy is never Completed.");
  }
  await doc?.update({ [`flags.${MODULE_ID}.status`]: status });
}

export async function duplicate(id: string): Promise<void> {
  const doc = await getEncounter(id);
  if (!doc) return;
  const copy = await copyEncounter(id, doc._source.folder, { rename: true });
  if (copy) openBuilder(copy.id);
}

export async function removeEncounter(id: string): Promise<void> {
  const entry = pack()?.index.get(id);
  if (!entry || !(await confirmDelete(entry.name))) return;
  if (builder()?.encounterId === id) builder()?.closeEncounter();
  await deleteEncounter(id);
}

/** Import, then show the tracker and fold the Builder away so the fight has room. */
export async function runImport(id: string): Promise<void> {
  if (!(await importEncounter(id))) return;
  const tab = ui.combat;
  if (tab?.ui) tab.ui.forceBrowser = false;
  tab?.render();
  const drawer = builder();
  if (drawer && !drawer.collapsed) drawer.setCollapsed(true);
}

export async function openLink(uuid: string | null | undefined): Promise<void> {
  if (!uuid) return;
  const doc = await fromUuid(uuid);
  if (!doc) return void ui.notifications.warn("The linked document is gone.");
  if (doc.documentName === "Scene") return doc.view();
  if (doc.documentName === "JournalEntryPage") return doc.parent.sheet.render({ force: true, pageId: doc.id });
  return doc.sheet.render({ force: true });
}

export function createCombatTab(Base: any) {
  return class EncounterDeckCombatTracker extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["encounter-deck-tab"],
      actions: {
        edNewCampaign: act(() => newCampaign()),
        edCampaignSettings: act(() => campaignSettings()),
        edTogglePresent: act((_app, t) => { const c = activeCampaign(); return c && togglePresent(c, t.dataset.actorId!); }),
        edShowCompleted: act((_app, t) => setSetting("showCompleted", (t as HTMLInputElement).checked)),
        edToggleFolder: act((app, t) => app.toggleFolder(folderOf(t))),
        edNewEncounter: act((_app, t) => newEncounter(folderOf(t))),
        edNewFolder: act((_app, t) => newFolder(folderOf(t))),
        edOpen: act((_app, t) => openBuilder(encounterOf(t))),
        edUseMaster: act((_app, t) => useMaster(encounterOf(t))),
        edShowBrowser: act((app) => { app.ui.forceBrowser = true; app.render(); }),
        edBackToTracker: act((app) => { app.ui.forceBrowser = false; app.render(); }),
        edImport: act((_app, t) => runImport(encounterOf(t))),
        edStatBlock: act((app, t) => showStatBlock(app.viewed?.combatants.get(t.closest<HTMLElement>("[data-combatant-id]")!.dataset.combatantId!), { toggle: true })),
      },
    };

    ui: BrowserUi & { forceBrowser: boolean } = { query: "", openEncounter: null, forceBrowser: false };
    #changedHook?: number;
    #browserFresh = false;
    #actorHook?: number;
    #renderQuery = foundry.utils.debounce(() => this.render({ parts: ["edBrowser"] }), 150);
    #renderTracker = foundry.utils.debounce(() => { if (!this.browserMode) this.render({ parts: ["tracker"] }); }, 50);

    /** The GM sees the browser while no combat is viewed, or after asking for it from the tracker. */
    get browserMode(): boolean {
      return game.user.isGM && (!this.viewed || this.ui.forceBrowser);
    }

    _configureRenderParts(options: any) {
      const parts = super._configureRenderParts(options);
      if (!game.user.isGM) return parts;
      return {
        edBrowser: { template: T("browser"), templates: [T("folder")], scrollable: [".ed-tree"] },
        ...parts,
      };
    }

    async _preparePartContext(partId: string, context: any, options: any) {
      context = await super._preparePartContext(partId, context, options);
      if (partId !== "edBrowser") return context;
      this.#browserFresh = this.browserMode;
      if (!this.browserMode) return Object.assign(context, { ready: false, inactive: true });
      this.ui.openEncounter = builder()?.encounterId ?? null;
      return Object.assign(context, browserContext(this.ui), { inCombat: !!this.viewed });
    }

    async _onFirstRender(context: any, options: any) {
      await super._onFirstRender(context, options);
      if (!game.user.isGM) return;
      this.#changedHook = Hooks.on(CHANGED_HOOK, () => {
        if (this.browserMode) this.render({ parts: ["edBrowser"] });
        else this.#browserFresh = false;
      });
      // Keep the AC and HP columns current: a PC's sheet edit or a monster's damage changes the actor, not the combat.
      this.#actorHook = Hooks.on("updateActor", (actor: any) => {
        if (this.viewed?.combatants.some((c: any) => c.actor === actor || c.actorId === actor.id)) this.#renderTracker();
      });
      const el: HTMLElement = this.element;
      el.addEventListener("change", (e: Event) => {
        const t = e.target as HTMLInputElement;
        if (t.matches(".ed-campaign-select")) setActiveCampaign(t.value);
      });
      el.addEventListener("input", (e: Event) => {
        const t = e.target as HTMLInputElement;
        if (!t.matches(".ed-query")) return;
        this.ui.query = t.value;
        this.#renderQuery();
      });
      this.bindDragDrop(el);
      const menu = (selector: string, items: any[]) =>
        new foundry.applications.ux.ContextMenu.implementation(el, selector, items, { jQuery: false, fixed: true });
      menu(".ed-row", this.rowMenu());
      menu(".ed-folder-head", this.folderMenu());
    }

    _onClose(options: any) {
      super._onClose(options);
      if (this.#changedHook !== undefined) Hooks.off(CHANGED_HOOK, this.#changedHook);
      if (this.#actorHook !== undefined) Hooks.off("updateActor", this.#actorHook);
    }

    async _onRender(context: any, options: any) {
      await super._onRender(context, options);
      const el: HTMLElement = this.element;
      el.classList.toggle("ed-browser-mode", this.browserMode);
      if (!game.user.isGM) return;
      // The browser part was last rendered while hidden: bring it up to date now that it shows.
      if (this.browserMode && !this.#browserFresh) this.render({ parts: ["edBrowser"] });
      // In the tracker, a button to get back to the browser.
      const header = el.querySelector<HTMLElement>(":scope > [data-application-part='header']");
      if (header && !this.browserMode && !header.querySelector(".ed-show-browser")) {
        header.insertAdjacentHTML("afterbegin", `<button type="button" class="ed-show-browser" data-action="edShowBrowser"><i class="fa-solid fa-book-skull" inert></i> Encounters</button>`);
      }
      if (!this.browserMode) this.addStatColumns(el);
    }

    /** AC and HP on every row of the running fight, HP typed in like the token HUD, and a stat block button for monsters. */
    addStatColumns(el: HTMLElement): void {
      const combat = this.viewed;
      if (!combat) return;
      for (const li of el.querySelectorAll<HTMLElement>("li.combatant[data-combatant-id]")) {
        const combatant = combat.combatants.get(li.dataset.combatantId);
        const actor = combatant?.actor;
        const hp = actor?.system?.attributes?.hp;
        if (!actor || !hp || li.querySelector(":scope > .ed-stats")) continue;
        const ac = actor.system.attributes.ac?.value ?? "—";
        const low = hp.max && hp.value <= hp.max / 2 ? "bloodied" : "";
        const stats = document.createElement("div");
        stats.className = "ed-stats";
        stats.innerHTML = `
          <span class="ed-ac" data-tooltip="Armor Class"><i class="fa-solid fa-shield" inert></i>${esc(String(ac))}</span>
          <span class="ed-hp ${low} ${hp.value <= 0 ? "down" : ""}" data-tooltip="Hit Points: type -7 for damage, +5 for healing, or a new value">
            <input type="text" class="ed-hp-input" value="${hp.value}" inputmode="numeric" aria-label="Hit Points of ${esc(combatant.name)}"><span class="ed-hp-max">/${hp.max ?? "?"}</span>
          </span>
          ${isMonster(combatant) ? `<button type="button" class="inline-control icon fa-solid fa-book-open ed-sb-button" data-action="edStatBlock" data-tooltip="Stat block" aria-label="Stat block of ${esc(combatant.name)}"></button>` : ""}`;
        li.querySelector(":scope > .token-initiative")?.before(stats);
      }
    }

    _onChangeInput(event: Event) {
      const input = event.target as HTMLInputElement;
      if (!input.classList?.contains("ed-hp-input")) return super._onChangeInput(event);
      const combatant = this.viewed?.combatants.get(input.closest<HTMLElement>("[data-combatant-id]")?.dataset.combatantId);
      const parsed = parseHp(input.value);
      if (!combatant?.actor || !parsed) {
        input.value = String(combatant?.actor?.system.attributes.hp.value ?? "");
        return;
      }
      return combatant.actor.modifyTokenAttribute("attributes.hp", parsed.value, parsed.isDelta, true);
    }

    /** Double-clicking a monster opens its stat block in the fixed spot. */
    _onCombatantMouseDown(event: any, target: HTMLElement) {
      if (event.type === "dblclick" && game.user.isGM) {
        const combatant = this.viewed?.combatants.get(target?.dataset.combatantId);
        if (isMonster(combatant)) return void showStatBlock(combatant);
      }
      return super._onCombatantMouseDown(event, target);
    }

    toggleFolder(id: string): void {
      const collapsed = { ...(setting("collapsedFolders") ?? {}) };
      if (collapsed[id]) delete collapsed[id];
      else collapsed[id] = true;
      setSetting("collapsedFolders", collapsed).then(() => this.render({ parts: ["edBrowser"] }));
    }

    rowMenu(): any[] {
      const id = (li: HTMLElement) => li.dataset.encounterId!;
      const entry = (li: HTMLElement) => pack()?.index.get(id(li));
      const statusOf = (li: HTMLElement) => entry(li)?.flags?.[MODULE_ID]?.status ?? "draft";
      const library = (li: HTMLElement) => li.dataset.library === "true";
      return [
        { label: "Open in Builder", icon: "fa-solid fa-hammer", onClick: (_e: Event, li: HTMLElement) => openBuilder(id(li)) },
        { label: "Import into this scene", icon: "fa-solid fa-play", onClick: (_e: Event, li: HTMLElement) => runImport(id(li)) },
        { label: `Use in Active Campaign`, icon: "fa-solid fa-copy", visible: (li: HTMLElement) => library(li) && !!activeCampaign(),
          onClick: (_e: Event, li: HTMLElement) => useMaster(id(li)) },
        { label: "Duplicate", icon: "fa-solid fa-clone", onClick: (_e: Event, li: HTMLElement) => duplicate(id(li)) },
        ...STATUSES.map(status => ({
          label: `Mark ${STATUS_LABELS[status]}`, icon: "fa-solid fa-flag",
          visible: (li: HTMLElement) => statusOf(li) !== status && !(status === "completed" && library(li)),
          onClick: (_e: Event, li: HTMLElement) => setStatus(id(li), status),
        })),
        { label: "Open Link", icon: "fa-solid fa-link", visible: (li: HTMLElement) => !!entry(li)?.flags?.[MODULE_ID]?.link,
          onClick: (_e: Event, li: HTMLElement) => openLink(entry(li)?.flags?.[MODULE_ID]?.link) },
        { label: "Rename", icon: "fa-solid fa-pen", onClick: async (_e: Event, li: HTMLElement) => {
          const name = await askName("Rename Encounter", "Encounter name", entry(li)?.name);
          if (name) (await getEncounter(id(li)))?.update({ name });
        } },
        { label: "Delete", icon: "fa-solid fa-trash", onClick: (_e: Event, li: HTMLElement) => removeEncounter(id(li)) },
      ];
    }

    folderMenu(): any[] {
      const folder = (li: HTMLElement) => folderById(folderOf(li));
      const isRoot = (li: HTMLElement) => !!kindOf(folder(li));
      return [
        { label: "New Encounter", icon: "fa-solid fa-plus", onClick: (_e: Event, li: HTMLElement) => newEncounter(folderOf(li)) },
        { label: "New Folder", icon: "fa-solid fa-folder-plus", visible: (li: HTMLElement) => li.dataset.canNest === "true",
          onClick: (_e: Event, li: HTMLElement) => newFolder(folderOf(li)) },
        { label: "Campaign Settings", icon: "fa-solid fa-gear", visible: (li: HTMLElement) => kindOf(folder(li)) === "campaign",
          onClick: () => campaignSettings() },
        { label: "Rename", icon: "fa-solid fa-pen", visible: (li: HTMLElement) => !isRoot(li), onClick: async (_e: Event, li: HTMLElement) => {
          const name = await askName("Rename Folder", "Folder name", folder(li)?.name);
          if (name) await folder(li)?.update({ name });
        } },
        { label: "Delete", icon: "fa-solid fa-trash", visible: (li: HTMLElement) => !isRoot(li), onClick: async (_e: Event, li: HTMLElement) => {
          const f = folder(li);
          if (f && (await confirmDelete(`the folder ${f.name} and everything in it`))) await deleteFolder(f.id);
        } },
      ];
    }

    /**
     * Drag an Encounter onto a folder. Within the same Campaign (or within the Shared Library) it moves;
     * from the Shared Library into a Campaign it's copied (copy-on-use); from a Campaign into the Library it's
     * copied as a new Master Copy.
     */
    bindDragDrop(el: HTMLElement): void {
      el.addEventListener("dragstart", (e: DragEvent) => {
        const row = (e.target as HTMLElement).closest?.<HTMLElement>(".ed-row");
        if (!row || !e.dataTransfer) return;
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, id: row.dataset.encounterId }));
        e.dataTransfer.effectAllowed = "copyMove";
      });
      el.addEventListener("dragover", (e: DragEvent) => {
        const head = (e.target as HTMLElement).closest?.(".ed-folder-head");
        if (!head) return;
        e.preventDefault();
        head.classList.add("ed-drop");
      });
      el.addEventListener("dragleave", (e: DragEvent) => {
        (e.target as HTMLElement).closest?.(".ed-folder-head")?.classList.remove("ed-drop");
      });
      el.addEventListener("drop", async (e: DragEvent) => {
        const head = (e.target as HTMLElement).closest?.<HTMLElement>(".ed-folder-head");
        if (!head) return;
        head.classList.remove("ed-drop");
        let data: any;
        try { data = JSON.parse(e.dataTransfer?.getData("text/plain") ?? ""); } catch { return; }
        if (data?.type !== DRAG_TYPE || !data.id) return;
        e.preventDefault();
        const target = folderOf(head);
        const entry = pack()?.index.get(data.id);
        if (!entry || entry.folder === target) return;
        const fromLibrary = isInLibrary(entry.folder);
        const toLibrary = isInLibrary(target);
        if (rootOf(entry.folder)?.id === rootOf(target)?.id) return moveEncounter(data.id, target);
        if (fromLibrary && !toLibrary) return useMaster(data.id, target);
        // copyEncounter turns a Completed one back to Ready, so a new Master Copy is never Completed.
        const copy = await copyEncounter(data.id, target);
        if (copy) ui.notifications.info(`Copied "${copy.name}" into ${rootOf(target)?.name}.`);
      });
    }
  };
}
