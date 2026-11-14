export const MODULE_ID = "encounter-deck";
/** The world compendium that holds every Campaign and the Shared Library (ADR 0001, ADR 0003). */
export const PACK_NAME = "encounter-deck";
export const PACK_ID = `world.${PACK_NAME}`;
/** Drag data type for an Encounter row, and a MIME type that marks the drag so drop targets can light up early. */
export const ENCOUNTER_DRAG_TYPE = "EncounterDeckEncounter";
export const ENCOUNTER_DRAG_MIME = "application/x-encounter-deck-encounter";
/** Fired after anything the browser or Builder shows has changed. */
export const CHANGED_HOOK = "encounterDeck.changed";

export type Status = "draft" | "ready" | "completed";
export const STATUSES: Status[] = ["draft", "ready", "completed"];
export const STATUS_LABELS: Record<Status, string> = { draft: "Draft", ready: "Ready", completed: "Completed" };

export type AdvancementMode = "xp" | "milestone";
/** A Campaign's own choice, or "default" to follow the world setting. */
export type CampaignAdvancement = AdvancementMode | "default";

export type FolderKind = "campaign" | "library";

/** One Creature Entry's saved copy of its monster, so the row can still show it if the Source is gone. */
export interface EntryCache {
  uuid: string;
  name: string;
  img: string;
  cr: number | null;
  xp: number;
}

export interface EncounterFlags {
  status: Status;
  tags: string[];
  notes: string;
  tactics: string;
  /** UUID of a linked JournalEntryPage, JournalEntry or Scene. */
  link: string | null;
  entries: EntryCache[];
  /** The Master Copy this Encounter was copied from, if any. */
  copiedFrom?: string | null;
  /** In its lair: Import puts every monster that has a lair inside it (2024 rules, +1 legendary action and resistance). */
  inLair?: boolean;
}

export const T = (name: string) => `modules/${MODULE_ID}/templates/${name}.hbs`;
