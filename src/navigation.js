/**
 * Board navigation maths.
 *
 * Kept apart from `app.js` — and free of the DOM — so the edge and wrap-around
 * cases can be tested directly.
 */

import { CELLS, SIZE, colOf, rowOf } from './sudoku.js';

/** Move by whole cells, stopping at the edges rather than wrapping. */
export function stepBy(from, dRow, dCol) {
  const row = Math.min(SIZE - 1, Math.max(0, rowOf(from) + dRow));
  const col = Math.min(SIZE - 1, Math.max(0, colOf(from) + dCol));
  return row * SIZE + col;
}

/** First (`start`) or last (`end`) cell of the row `from` sits in. */
export function rowEdge(from, side) {
  return rowOf(from) * SIZE + (side === 'start' ? 0 : SIZE - 1);
}

/** Top (`start`) or bottom (`end`) cell of the column `from` sits in. */
export function colEdge(from, side) {
  return (side === 'start' ? 0 : SIZE - 1) * SIZE + colOf(from);
}

/**
 * The next cell with no value, in reading order, wrapping past the end of the
 * board. Pencil marks do not count as filled.
 *
 * @param {number[]} grid
 * @param {number|null} from cell to start from; null starts at the board edge
 * @param {number} step 1 to search forwards, -1 backwards
 * @returns {number|null} null when every cell is filled
 */
export function nextEmpty(grid, from, step = 1) {
  const start = from ?? (step > 0 ? -1 : 0);
  for (let n = 1; n <= CELLS; n++) {
    const index = (((start + step * n) % CELLS) + CELLS) % CELLS;
    if (!grid[index]) return index;
  }
  return null;
}
