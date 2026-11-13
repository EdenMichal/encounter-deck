/**
 * The Builder: a collapsible drawer docked on the side of the Combat tab. It searches the Sources, adds monsters
 * with + or drag, edits Creature Entries and shows a live 2024 difficulty meter for the Active Campaign's
 * present PCs. Every edit saves straight to the Encounter in the compendium.
 */
import { CHANGED_HOOK, MODULE_ID, STATUSES, STATUS_LABELS, T, type EncounterFlags, type Status } from "../constants";
import { activeCampaign, advancementOf } from "../campaigns";
import { meter } from "../difficulty";
import { addEntry, changeCount, readEntries, removeEntry, swapEntry, toSource, totalCount, totalXp, type CreatureEntry } from "../entries";
import { CR_STEPS, EMPTY_FILTER, filterMonsters, formatCr, type Monster, type MonsterFilter } from "../monsters";
import { setSetting, setting } from "../settings";
import { cachedMonsters, invalidateMonsters, loadMonsters, lookupMonster, openSourcesConfig, sourcePacks, xpForCr } from "../sources";
import { encounterFlags, getEncounter, isInLibrary, pack, rootOf, folderById } from "../store";
import { partyContext } from "./browser-model";
import { duplicate, openLink, removeEncounter, setStatus } from "./combat-tab";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const RESULT_LIMIT = 100;
const fmt = (n: number) => new Intl.NumberFormat(game.i18n.lang).format(n);
const LINK_TYPES = ["JournalEntryPage", "JournalEntry", "Scene"];

type Handler = (this: any, event: Event, target: HTMLElement) => unknown;
const act = (fn: (app: Builder, target: HTMLElement, event: Event) => unknown): Handler =>
  function (this: any, event, target) { return fn(this, target, event); };
const uuidOf = (t: HTMLElement) => t.closest<HTMLElement>("[data-uuid]")!.dataset.uuid!;

let instance: Builder | null = null;
export const builder = () => instance;

/** Open an Encounter in the Builder and slide the drawer out. */
export async function openBuilder(id: string): Promise<void> {
  if (!instance) return;
  await instance.openEncounter(id);
}

export function startBuilder(): void {
  if (!game.user.isGM) return;
  instance = new Builder();
  instance.render({ force: true });
  const sync = () => instance?.syncVisibility();
  Hooks.on("changeSidebarTab", sync);
  Hooks.on("collapseSidebar", sync);
  // dnd5e's Sources checklist is a world setting: the first save creates it, later saves update it.
  const onSources = (s: any) => {
    if (s.key !== "dnd5e.packSourceConfiguration") return;
    invalidateMonsters();
    instance?.render({ parts: ["search"] });
    instance?.refreshResults();
  };
  Hooks.on("createSetting", onSources);
  Hooks.on("updateSetting", onSources);
  // Fold the drawer away when a fight begins, so it doesn't cover a carousel tracker across the top. The GM can
  // reopen it. combatStart only fires on the client that pressed Begin Combat, so watch the round 0 → 1 update,
  // which every client sees; Combat#startCombat is the only change to round 1 made without a turn direction.
  Hooks.on("updateCombat", (_combat: any, changed: any, options: any) => {
    if (changed.round === 1 && options?.direction === undefined && instance && !instance.collapsed) instance.setCollapsed(true);
  });
}

const choices = (config: Record<string, any>) =>
  Object.entries(config).map(([value, c]) => ({ value, label: typeof c === "string" ? c : c.label ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label));

class Builder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-deck-builder",
    tag: "aside",
    classes: ["encounter-deck", "ed-builder"],
    window: { frame: false, positioned: false },
    actions: {
      edCollapse: act(app => app.setCollapsed(!app.collapsed)),
      edAdd: act((app, t) => app.addMonster(uuidOf(t))),
      edInc: act((app, t) => app.editEntries(e => changeCount(e, uuidOf(t), 1))),
      edDec: act((app, t) => app.editEntries(e => changeCount(e, uuidOf(t), -1))),
      edRemove: act((app, t) => { if (app.swapTarget === uuidOf(t)) app.swapTarget = null; return app.editEntries(e => removeEntry(e, uuidOf(t))); }),
      edSwap: act((app, t) => { const u = uuidOf(t); app.swapTarget = app.swapTarget === u ? null : u; app.render({ parts: ["entries", "results"] }); }),
      edSheet: act((_app, t) => fromUuid(uuidOf(t)).then((a: any) => a?.sheet.render({ force: true }))),
      edSources: act(() => openSourcesConfig()),
      edClearFilters: act(app => { app.filter = { ...EMPTY_FILTER }; app.render({ parts: ["search", "results"] }); }),
      edOpenLink: act(app => openLink(app.flags?.link)),
      edClearLink: act(app => app.saveFlags({ link: null }, true)),
      edDuplicate: act(app => app.encounterId && duplicate(app.encounterId)),
      edDelete: act(app => app.encounterId && removeEncounter(app.encounterId)),
      edCloseEncounter: act(app => app.closeEncounter()),
    },
  };

  static PARTS = {
    handle: { template: T("builder-handle") },
    search: { template: T("builder-search") },
    results: { template: T("builder-results"), scrollable: [".ed-results"] },
    head: { template: T("builder-head") },
    details: { template: T("builder-details"), scrollable: [""] },
    entries: { template: T("builder-entries"), scrollable: [".ed-entries"] },
  };

  encounterId: string | null = null;
  doc: any = null;
  entries: CreatureEntry[] = [];
  filter: MonsterFilter = { ...EMPTY_FILTER };
  swapTarget: string | null = null;
  collapsed = !!setting("builderCollapsed");
  #changedHook?: number;
  /** Saves still in flight. Until they land, our local entries are newer than the document. */
  #pending = 0;
  #renderResults = foundry.utils.debounce(() => this.render({ parts: ["results"] }), 120);

  get flags(): EncounterFlags | null {
    return this.doc ? encounterFlags(this.doc) : null;
  }

  /* -------------------------------------------- */
  /*  Docking                                     */
  /* -------------------------------------------- */

  /** Live next to the sidebar rather than floating over the canvas. */
  async _insertElement(element: HTMLElement) {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (document.getElementById("sidebar") ?? document.body).append(element);
  }

  /** Only on the Combat tab, and only while the sidebar is expanded. */
  syncVisibility(): void {
    if (!this.element) return;
    const show = !!ui.sidebar?.expanded && ui.sidebar?.tabGroups?.primary === "combat";
    this.element.classList.toggle("ed-hidden", !show);
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    setSetting("builderCollapsed", collapsed);
    this.element?.classList.toggle("collapsed", collapsed);
    if (!collapsed) this.refreshResults();
    this.render({ parts: ["handle"] });
  }

  /* -------------------------------------------- */
  /*  Encounter                                   */
  /* -------------------------------------------- */

  async openEncounter(id: string): Promise<void> {
    const doc = await getEncounter(id);
    if (!doc) return void ui.notifications.warn("That Encounter is gone.");
    this.encounterId = id;
    this.doc = doc;
    this.swapTarget = null;
    this.readDoc();
    if (ui.sidebar?.tabGroups?.primary !== "combat") ui.sidebar?.changeTab("combat", "primary");
    if (!ui.sidebar?.expanded) ui.sidebar?.expand();
    this.setCollapsed(false);
    await this.render({ parts: ["head", "details", "entries", "results"] });
    ui.combat?.render({ parts: ["edBrowser"] });
  }

  closeEncounter(): void {
    this.encounterId = null;
    this.doc = null;
    this.entries = [];
    this.swapTarget = null;
    this.render({ parts: ["head", "details", "entries", "results"] });
    ui.combat?.render({ parts: ["edBrowser"] });
  }

  readDoc(): void {
    const flags = encounterFlags(this.doc);
    this.entries = readEntries(this.doc._source.system?.members ?? [], flags.entries, lookupMonster);
  }

  async editEntries(fn: (entries: CreatureEntry[]) => CreatureEntry[]): Promise<void> {
    if (!this.doc) return;
    this.entries = fn(this.entries);
    this.render({ parts: ["entries"] });
    const { members, cache } = toSource(this.entries);
    await this.#save({ "system.members": members, [`flags.${MODULE_ID}.entries`]: cache });
  }

  async saveFlags(changes: Partial<EncounterFlags>, rerender = false): Promise<void> {
    if (!this.doc) return;
    const update = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`flags.${MODULE_ID}.${k}`, v]));
    await this.#save(update);
    if (rerender) this.render({ parts: ["head", "details"] });
  }

  async #save(update: object): Promise<void> {
    this.#pending++;
    try { await this.doc.update(update); }
    finally { this.#pending--; }
    if (!this.#pending) this.onChanged();
  }

  monsterByUuid(uuid: string): Monster | null {
    return cachedMonsters()?.find(m => m.uuid === uuid) ?? null;
  }

  /** + on a result: add it, or swap it in when a missing row is waiting for a replacement. */
  async addMonster(uuid: string, cache?: Monster | null): Promise<void> {
    if (!this.doc) return void ui.notifications.warn("Open or create an Encounter first.");
    const monster = cache ?? this.monsterByUuid(uuid) ?? (await this.monsterFromDocument(uuid));
    if (!monster) return;
    const entry = { uuid: monster.uuid, name: monster.name, img: monster.img, cr: monster.cr, xp: monster.xp };
    if (this.swapTarget) {
      const target = this.swapTarget;
      this.swapTarget = null;
      this.render({ parts: ["results"] });
      return this.editEntries(e => swapEntry(e, target, entry));
    }
    return this.editEntries(e => addEntry(e, entry));
  }

  async monsterFromDocument(uuid: string): Promise<Monster | null> {
    const actor = await fromUuid(uuid);
    if (actor?.documentName !== "Actor" || actor.type !== "npc") {
      ui.notifications.warn("Only NPC actors can be added to an Encounter.");
      return null;
    }
    const cr = actor.system.details?.cr ?? null;
    return { uuid: actor.uuid, name: actor.name, img: actor.img, cr, xp: xpForCr(cr), type: "", size: "", habitats: [], pack: actor.pack ?? "" };
  }

  refreshResults(): void {
    if (this.collapsed) return;
    if (!cachedMonsters()) loadMonsters().then(() => this.render({ parts: ["results"] }));
    this.render({ parts: ["results"] });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options);
    switch (partId) {
      case "handle": return Object.assign(context, { collapsed: this.collapsed, name: this.doc?.name });
      case "search": return Object.assign(context, this.searchContext());
      case "results": return Object.assign(context, this.resultsContext());
      case "head": case "details": return Object.assign(context, this.detailsContext());
      case "entries": return Object.assign(context, this.entriesContext());
    }
    return context;
  }

  searchContext() {
    const f = this.filter;
    const crs = CR_STEPS.map(cr => ({ value: String(cr), label: formatCr(cr) }));
    const mark = (list: { value: string; label: string }[], selected: string) => list.map(o => ({ ...o, selected: o.value === selected }));
    return {
      filter: f,
      crMin: mark(crs, f.crMin === null ? "" : String(f.crMin)),
      crMax: mark(crs, f.crMax === null ? "" : String(f.crMax)),
      types: mark(choices(CONFIG.DND5E.creatureTypes), f.type),
      sizes: mark(choices(CONFIG.DND5E.actorSizes), f.size),
      habitats: mark(choices(CONFIG.DND5E.habitats), f.habitat),
      sourceCount: sourcePacks().length,
      filtered: this.filtered,
    };
  }

  get filtered(): boolean {
    return Object.entries(this.filter).some(([k, v]) => (k === "name" ? !!v : v !== null && v !== ""));
  }

  /** Typing only re-renders the results, so show or hide "Clear filters" by hand. */
  syncClearButton(): void {
    const button = this.element?.querySelector(".ed-clear-filters") as HTMLElement | null;
    if (button) button.hidden = !this.filtered;
  }

  resultsContext() {
    if (this.collapsed) return { loading: true };
    const all = cachedMonsters();
    if (!all) return { loading: true };
    const found = filterMonsters(all, this.filter);
    const size = (s: string) => CONFIG.DND5E.actorSizes[s]?.label ?? s;
    const type = (t: string) => CONFIG.DND5E.creatureTypes[t]?.label ?? t;
    const packLabel = (p: string) => game.packs.get(p)?.metadata.label ?? p;
    return {
      loading: false,
      canAdd: !!this.doc,
      swapping: !!this.swapTarget,
      total: fmt(found.length),
      limited: found.length > RESULT_LIMIT,
      limit: RESULT_LIMIT,
      results: found.slice(0, RESULT_LIMIT).map(m => ({
        ...m, crLabel: formatCr(m.cr), xpLabel: fmt(m.xp),
        subtitle: [size(m.size), type(m.type)].filter(Boolean).join(" "), packLabel: packLabel(m.pack),
      })),
    };
  }

  detailsContext() {
    if (!this.doc) return { open: false };
    const flags = this.flags!;
    const folderId = this.doc._source.folder;
    const library = isInLibrary(folderId);
    const root = rootOf(folderId);
    const folder = folderById(folderId);
    const link = flags.link ? fromUuidSync(flags.link, { strict: false }) : null;
    return {
      open: true,
      name: this.doc.name,
      library,
      where: [root?.name, folder && folder.id !== root?.id ? folder.name : null].filter(Boolean).join(" / "),
      statuses: STATUSES.filter(s => !(library && s === "completed")).map(s => ({ value: s, label: STATUS_LABELS[s], selected: s === flags.status })),
      tags: flags.tags.join(", "),
      notes: flags.notes,
      tactics: flags.tactics,
      link: flags.link ? { uuid: flags.link, name: link?.name ?? "Missing document", missing: !link, icon: link?.documentName === "Scene" ? "fa-map" : "fa-book-open" } : null,
      copiedFrom: flags.copiedFrom ? fromUuidSync(flags.copiedFrom, { strict: false })?.name ?? null : null,
    };
  }

  entriesContext() {
    if (!this.doc) return { open: false };
    const campaign = activeCampaign();
    const party = partyContext(campaign);
    const xp = totalXp(this.entries);
    const m = meter(xp, party.budget);
    return {
      open: true,
      swapping: this.swapTarget,
      entries: this.entries.map(e => ({
        ...e, crLabel: formatCr(e.cr), xpLabel: fmt(e.xp * e.count), swapTarget: this.swapTarget === e.uuid,
      })),
      count: totalCount(this.entries),
      meter: { ...m, xpLabel: fmt(m.xp), low: fmt(m.budget.low), moderate: fmt(m.budget.moderate), high: fmt(m.budget.high) },
      party: { ...party, campaign: campaign?.name ?? null, advancement: campaign && advancementOf(campaign) === "milestone" ? "Milestone" : "XP" },
    };
  }

  async _onFirstRender(context: any, options: any) {
    await super._onFirstRender(context, options);
    this.element.classList.toggle("collapsed", this.collapsed);
    this.syncVisibility();
    this.#changedHook = Hooks.on(CHANGED_HOOK, () => this.onChanged());
    // Some compendium art paths don't exist; show the default portrait instead of a broken image.
    this.element.addEventListener("error", (e: Event) => {
      const img = e.target as HTMLImageElement;
      if (img?.tagName === "IMG" && !img.dataset.fallback) { img.dataset.fallback = "1"; img.src = CONST.DEFAULT_TOKEN; }
    }, true);
    this.bindInputs(this.element);
    this.bindDragDrop(this.element);
    if (!this.collapsed) this.refreshResults();
  }

  _onClose(options: any) {
    super._onClose(options);
    if (this.#changedHook !== undefined) Hooks.off(CHANGED_HOOK, this.#changedHook);
  }

  /** Something changed in the pack or the party. Re-read our Encounter unless it was our own save. */
  async onChanged(): Promise<void> {
    if (!this.encounterId) return void this.render({ parts: ["entries"] });
    const entry = pack()?.index.get(this.encounterId);
    if (!entry) return this.closeEncounter();
    if (this.#pending) return;
    const doc = await getEncounter(this.encounterId);
    const nameChanged = doc?.name !== this.doc?.name;
    const prevFlags = JSON.stringify({ ...this.flags, entries: undefined });
    this.doc = doc;
    this.readDoc();
    const parts = ["entries", "handle"];
    // Text fields save on change; only re-render them when something else edited them, so focus isn't lost.
    if (nameChanged || prevFlags !== JSON.stringify({ ...this.flags, entries: undefined })) {
      for (const part of ["head", "details"]) {
        if (!this.element.querySelector(`[data-application-part='${part}']`)?.contains(document.activeElement)) parts.push(part);
      }
    }
    this.render({ parts });
  }

  bindInputs(el: HTMLElement): void {
    el.addEventListener("input", (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "edName") { this.filter.name = t.value; this.syncClearButton(); this.#renderResults(); }
    });
    el.addEventListener("change", (e: Event) => {
      const t = e.target as HTMLInputElement;
      const num = (v: string) => (v === "" ? null : Number(v));
      switch (t.name) {
        case "edCrMin": this.filter.crMin = num(t.value); break;
        case "edCrMax": this.filter.crMax = num(t.value); break;
        case "edType": this.filter.type = t.value; break;
        case "edSize": this.filter.size = t.value; break;
        case "edHabitat": this.filter.habitat = t.value; break;
        case "name": if (t.value.trim()) this.doc?.update({ name: t.value.trim() }); return;
        case "status": if (this.encounterId) setStatus(this.encounterId, t.value as Status); return;
        case "tags": this.saveFlags({ tags: [...new Set(t.value.split(",").map(s => s.trim()).filter(Boolean))] }); return;
        case "notes": this.saveFlags({ notes: t.value }); return;
        case "tactics": this.saveFlags({ tactics: t.value }); return;
        default: return;
      }
      this.syncClearButton();
      this.render({ parts: ["results"] });
    });
  }

  bindDragDrop(el: HTMLElement): void {
    el.addEventListener("dragstart", (e: DragEvent) => {
      const row = (e.target as HTMLElement).closest?.<HTMLElement>(".ed-result");
      if (!row || !e.dataTransfer) return;
      e.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: row.dataset.uuid }));
      e.dataTransfer.effectAllowed = "copy";
    });
    const zoneOf = (e: DragEvent) => (e.target as HTMLElement).closest?.<HTMLElement>(".ed-dropzone");
    el.addEventListener("dragover", (e: DragEvent) => {
      const zone = zoneOf(e);
      if (!zone || !this.doc) return;
      e.preventDefault();
      zone.classList.add("ed-drop");
    });
    el.addEventListener("dragleave", (e: DragEvent) => zoneOf(e)?.classList.remove("ed-drop"));
    el.addEventListener("drop", async (e: DragEvent) => {
      const zone = zoneOf(e);
      if (!zone || !this.doc) return;
      e.preventDefault();
      zone.classList.remove("ed-drop");
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
      if (zone.dataset.zone === "link") return this.dropLink(data);
      if (data?.type !== "Actor" || !data.uuid) return;
      // Dropped on a row: swap that row's monster.
      const row = (e.target as HTMLElement).closest<HTMLElement>(".ed-entry");
      if (row) this.swapTarget = row.dataset.uuid!;
      return this.addMonster(data.uuid);
    });
  }

  async dropLink(data: any): Promise<void> {
    if (!LINK_TYPES.includes(data?.type) || !data.uuid) {
      return void ui.notifications.warn("Drop a journal page, journal entry or scene to link it.");
    }
    await this.saveFlags({ link: data.uuid }, true);
  }
}
