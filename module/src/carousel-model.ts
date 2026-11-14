/**
 * The pure part of the Carousel: who sees it, and what each card shows to whom. Players and the table display never
 * see a monster's initiative or HP; a monster at half HP or less shows Bloodied instead. No Foundry here, so it can
 * be tested.
 */

/** The "Show the carousel to" setting. */
export type Audience = "everyone" | "players" | "gm";

export interface Viewer {
  isGM: boolean;
  /** The user Monk's Common Display shows the map on. */
  isTable: boolean;
}

export function canSeeCarousel(audience: Audience, viewer: Viewer): boolean {
  if (viewer.isTable && audience !== "everyone") return false;
  if (viewer.isGM) return true;
  return audience !== "gm";
}

export interface StatusIcon { img: string; name: string }

export interface CombatantInput {
  id: string;
  name: string;
  img: string;
  initiative: number | null;
  /** A player character, or anything a player owns (a companion). Everyone else is a monster. */
  hero: boolean;
  /** Hidden in the combat tracker: only the GM sees it. */
  hidden: boolean;
  defeated: boolean;
  hp: { value: number; max: number } | null;
  ac: number | null;
  statuses: StatusIcon[];
}

export interface CardView {
  id: string;
  name: string;
  img: string;
  current: boolean;
  hero: boolean;
  defeated: boolean;
  /** Hidden from players; the GM sees the card dimmed. */
  secret: boolean;
  /** Null when this viewer doesn't get to see it. */
  init: string | null;
  hp: { text: string; pct: number; low: boolean } | null;
  bloodied: boolean;
  /** Null when this viewer doesn't get to see it: players never learn a monster's AC. */
  ac: string | null;
  statuses: (StatusIcon & { svg: boolean })[];
  /** How many more statuses didn't fit; the +N box opens the full list. */
  more: number;
  allStatuses: (StatusIcon & { svg: boolean })[];
}

/** At or below half HP, and still up. */
export const isBloodied = (value: number, max: number): boolean => max > 0 && value > 0 && value <= max / 2;

/** dnd5e adds the Dexterity tiebreaker as decimals; the card shows the roll. */
const formatInit = (n: number): string => String(Math.floor(n));

export function buildCards(list: CombatantInput[], currentId: string | null, isGM: boolean, maxStatuses = 4): CardView[] {
  return list
    .filter(c => isGM || !c.hidden)
    .map(c => {
      const seesNumbers = isGM || c.hero;
      const hp = c.hp && c.hp.max > 0 ? c.hp : null;
      const value = hp ? Math.max(0, hp.value) : 0;
      const all = c.statuses.map(s => ({ ...s, svg: /\.svg($|\?)/i.test(s.img) }));
      const shown = all.length > maxStatuses ? all.slice(0, maxStatuses - 1) : all;
      return {
        id: c.id,
        name: c.name,
        img: c.img,
        current: c.id === currentId,
        hero: c.hero,
        defeated: c.defeated,
        secret: c.hidden,
        init: seesNumbers && c.initiative !== null ? formatInit(c.initiative) : null,
        hp: seesNumbers && hp && !c.defeated
          ? { text: `${value}/${hp.max}`, pct: Math.min(100, Math.round((value / hp.max) * 100)), low: isBloodied(value, hp.max) }
          : null,
        bloodied: !seesNumbers && !!hp && !c.defeated && isBloodied(value, hp.max),
        ac: seesNumbers && c.ac !== null && Number.isFinite(c.ac) ? String(c.ac) : null,
        statuses: shown,
        more: all.length - shown.length,
        allStatuses: all,
      };
    });
}
