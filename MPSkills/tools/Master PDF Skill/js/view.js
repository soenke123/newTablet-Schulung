// View geometry: zoom steps, page rows and fit modes. Zoom 1 = 100 % = real size (1 pt = 96/72 CSS px), as in common PDF viewers.
export const CSS_UNITS = 96 / 72;
export const MIN_ZOOM = 0.25, MAX_ZOOM = 4, AUTO_MAX_ZOOM = 1.25;
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export const clampZoom = zoom => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : 1));

// Next preset step in the given direction (+1 larger, -1 smaller), starting from any zoom value.
export function stepZoom(zoom, direction) {
  if (direction > 0) return STEPS.find(step => step > zoom * 1.01) ?? MAX_ZOOM;
  return [...STEPS].reverse().find(step => step < zoom / 1.01) ?? MIN_ZOOM;
}

// Page indices grouped into rows: one page per row, or pairs (1-2, 3-4, …) for the two-page view.
export function pageRows(count, spread) {
  const rows = [];
  for (let i = 0; i < count; i += spread ? 2 : 1) rows.push(spread && i + 1 < count ? [i, i + 1] : [i]);
  return rows;
}

// rows: [[{width, height}, …], …] in PDF points (rotation applied); area: available CSS px; gap: CSS px between pages of a row (not scaled).
// 'width' fills the width with the widest row, 'page' shows the largest page completely, 'auto' is 'width' capped at AUTO_MAX_ZOOM.
export function fitZoom(mode, rows, area, gap = 0) {
  if (!rows.length) return 1;
  const byWidth = Math.min(...rows.map(row => (area.width - gap * (row.length - 1)) / (CSS_UNITS * row.reduce((sum, page) => sum + page.width, 0))));
  if (mode === 'width') return clampZoom(byWidth);
  if (mode === 'page') return clampZoom(Math.min(byWidth, ...rows.map(row => area.height / (CSS_UNITS * Math.max(...row.map(page => page.height))))));
  return clampZoom(Math.min(byWidth, AUTO_MAX_ZOOM));
}
