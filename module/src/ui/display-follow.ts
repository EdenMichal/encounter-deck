/**
 * Monk's Common Display pans the table display to the tokens it follows: whoever's turn it is (screen mode "combat")
 * or the tokens the GM controls ("controlled"). Imported monsters sit in the Margin, so every monster turn slid the
 * map off the table. Unless the "displayFollowsMargin" setting is on, tokens in the Margin are left out of what it
 * follows; with nothing left to follow, it keeps the view where it was.
 *
 * Common Display has no API for this, so we wrap its MonksCommonDisplay.getTokens. If a future version changes that,
 * the wrap is skipped and the display behaves as Common Display alone would.
 */
import { MODULE_ID } from "../constants";
import { inMargin } from "../fight";
import { setting } from "../settings";

const MCD = "monks-common-display";
const SCRIPT = `modules/${MCD}/${MCD}.js`;

export async function startDisplayFollow(): Promise<void> {
  if (!game.modules.get(MCD)?.active) return;
  // Import the very module instance Foundry loaded: same resolved URL as its own <script type="module">.
  const src = document.querySelector<HTMLScriptElement>(`script[type="module"][src$="${SCRIPT}"]`)?.src;
  if (!src) return;
  let MonksCommonDisplay: any;
  try {
    ({ MonksCommonDisplay } = await import(/* @vite-ignore */ src));
  } catch (err) {
    console.warn("Encounter Deck | Couldn't reach Monk's Common Display", err);
    return;
  }
  const original = MonksCommonDisplay?.getTokens;
  if (typeof original !== "function" || original.encounterDeck) return;
  const wrapped = function (this: any, ...args: unknown[]) {
    const tokens = original.apply(this, args);
    if (setting("displayFollowsMargin") || !Array.isArray(tokens) || !canvas.ready) return tokens;
    const size = canvas.dimensions.size;
    const sceneRect = canvas.dimensions.sceneRect;
    return tokens.filter((t: any) => !t || !inMargin({ x: t.x, y: t.y, width: t.width * size, height: t.height * size }, sceneRect));
  };
  wrapped.encounterDeck = true;
  MonksCommonDisplay.getTokens = wrapped;
  console.debug(`${MODULE_ID} | The table display won't follow tokens in the Margin unless the setting says so.`);
}
