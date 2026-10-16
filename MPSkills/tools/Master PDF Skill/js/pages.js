/** Pure helpers for the virtual page array (no DOM, no PDF libraries). */

/** Moves the pages whose ids are in `ids` (keeping their order) to `insertAt`, an index into the original array. */
export function movePages(pages, ids, insertAt) {
  const moving = pages.filter(page => ids.has(page.id));
  const rest = pages.filter(page => !ids.has(page.id));
  if (!moving.length) return pages.slice();
  const movedBefore = pages.slice(0, Math.max(0, insertAt)).filter(page => ids.has(page.id)).length;
  const at = Math.max(0, Math.min(insertAt - movedBefore, rest.length));
  rest.splice(at, 0, ...moving);
  return rest;
}

/** Returns a new array with `inserted` placed at `insertAt` (clamped). */
export function insertPages(pages, inserted, insertAt) {
  const result = pages.slice();
  const at = Number.isInteger(insertAt) ? Math.max(0, Math.min(insertAt, result.length)) : result.length;
  result.splice(at, 0, ...inserted);
  return result;
}

/** True when both arrays list the same page ids in the same order. */
export function sameOrder(a, b) {
  return a.length === b.length && a.every((page, i) => page.id === b[i].id);
}

/** Id of the page that should become active after removing `ids`: the next remaining page, else the previous one, else null. */
export function nextActiveAfterRemoval(pages, ids) {
  const first = pages.findIndex(page => ids.has(page.id));
  if (first < 0) return pages[0]?.id ?? null;
  const after = pages.slice(first).find(page => !ids.has(page.id));
  if (after) return after.id;
  const before = pages.slice(0, first).reverse().find(page => !ids.has(page.id));
  return before?.id ?? null;
}
