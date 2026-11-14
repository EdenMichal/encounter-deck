/**
 * The Sources dialog: the Builder's checklist of compendiums that hold monsters, grouped by the system, module or
 * world they come from, with each one's monster count and rules version. It edits dnd5e's world-wide Compendium
 * Browser checklist (ADR 0003), so a compendium switched off here is off there too.
 */
import { T } from "../constants";
import { sourceGroups, type PackSummary } from "../source-list";
import { openDnd5eSourcesConfig, packSummaries, setSources, sourceConfig } from "../sources";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const fmt = (n: number) => new Intl.NumberFormat(game.i18n.lang).format(n);

let instance: SourcesDialog | null = null;

export function openSourcesDialog(): void {
  instance ??= new SourcesDialog();
  instance.render({ force: true });
}

/** The checklist changed (here, or in dnd5e's own dialog): show the new state. */
export function refreshSourcesDialog(): void {
  if (instance?.rendered) instance.render();
}

class SourcesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-deck-sources",
    classes: ["encounter-deck", "ed-sources-app"],
    window: { title: "Sources", icon: "fa-solid fa-book-open-reader", resizable: true },
    position: { width: 400, height: "auto" as const },
    actions: {
      edAllCompendiums: () => openDnd5eSourcesConfig(),
    },
  };

  static PARTS = { body: { template: T("sources"), scrollable: [".ed-source-groups"] } };

  #summaries: PackSummary[] | null = null;

  async _prepareContext(options: any) {
    const context = await super._prepareContext(options);
    // Indexing every Actor compendium is the slow part, so do it once per opening.
    if (!this.#summaries || options.isFirstRender) this.#summaries = await packSummaries();
    const groups = sourceGroups(this.#summaries, sourceConfig()).map(g => ({
      ...g,
      ids: g.packs.map(p => p.id).join(","),
      all: g.on === g.packs.length,
      some: g.on > 0 && g.on < g.packs.length,
      packs: g.packs.map(p => ({ ...p, count: fmt(p.monsters) })),
    }));
    const packs = groups.flatMap(g => g.packs);
    const empty = this.#summaries.filter(s => s.monsters === 0);
    return Object.assign(context, {
      groups,
      on: packs.filter(p => p.on).length,
      total: packs.length,
      monsters: fmt(packs.filter(p => p.on).reduce((n, p) => n + p.monsters, 0)),
      hidden: empty.length,
      hiddenNames: empty.map(s => s.label).join(", "),
    });
  }

  _onRender(context: any, options: any) {
    super._onRender(context, options);
    const el = this.element as HTMLElement;
    for (const box of el.querySelectorAll<HTMLInputElement>("input[data-some]")) box.indeterminate = true;
    // The window element outlives re-renders, so listen once.
    if (!options.isFirstRender) return;
    el.addEventListener("change", (event: Event) => {
      const box = event.target as HTMLInputElement;
      const ids = box.dataset.ids?.split(",").filter(Boolean);
      if (!ids?.length) return;
      el.classList.add("ed-busy");
      setSources(ids, box.checked).finally(() => el.classList.remove("ed-busy"));
    });
  }

  async close(options?: any) {
    this.#summaries = null;
    return super.close(options);
  }
}
