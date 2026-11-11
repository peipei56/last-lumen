// Top-run list. Pure functions so the rules can be tested without a browser.
export const RANK_MAX = 10;

/** 1-based place a score would take in `list` (ties rank below existing entries). */
export function placeOf(list, score) {
  let n = 1;
  for (const e of list) if (e.score >= score) n++;
  return n;
}

/**
 * Insert `entry` into `list` (sorted high to low, trimmed to RANK_MAX).
 * Returns the 1-based place, or 0 if the run did not make the list.
 */
export function addRank(list, entry) {
  const place = placeOf(list, entry.score);
  if (place > RANK_MAX) return 0;
  list.splice(place - 1, 0, entry);
  list.length = Math.min(list.length, RANK_MAX);
  return place;
}

/** Drop anything malformed from saved data so a bad save cannot break the title screen. */
export function cleanRanks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && Number.isFinite(e.score) && Number.isFinite(e.time))
    .sort((a, b) => b.score - a.score)
    .slice(0, RANK_MAX);
}
