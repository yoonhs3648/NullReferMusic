/**
 * FAQ — KB + match re-export (기존 import 경로 유지).
 */

export { FAQ_KB, type FaqKbEntry } from './faqKb.ts';
export {
  FAQ_ENTRIES,
  formatFaqHitsForPrompt,
  matchFaqHits,
  type FaqHit,
} from './faqMatch.ts';
