/**
 * Sudoku engine: generation, solving, rating and validation.
 *
 * A grid is a plain Array(81) of integers where 0 means "empty" and 1..9 are
 * the symbol ids. The UI paints those ids as colors, but nothing in here knows
 * or cares about that.
 */

export const SIZE = 9;
export const CELLS = SIZE * SIZE;
export const ALL = 0x1ff; // bitmask of candidates 1..9

/** Row index of a cell. */
export const rowOf = (i) => (i / SIZE) | 0;
/** Column index of a cell. */
export const colOf = (i) => i % SIZE;
/** Box index (0..8, reading order) of a cell. */
export const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

/** Cells sharing a row, column or box with `i` (excluding `i` itself). */
export const PEERS = (() => {
  const peers = [];
  for (let i = 0; i < CELLS; i++) {
    const set = new Set();
    for (let j = 0; j < CELLS; j++) {
      if (j === i) continue;
      if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) set.add(j);
    }
    peers.push([...set]);
  }
  return peers;
})();

/** The 27 units (9 rows, 9 columns, 9 boxes) as arrays of cell indices. */
export const UNITS = (() => {
  const rows = Array.from({ length: SIZE }, () => []);
  const cols = Array.from({ length: SIZE }, () => []);
  const boxes = Array.from({ length: SIZE }, () => []);
  for (let i = 0; i < CELLS; i++) {
    rows[rowOf(i)].push(i);
    cols[colOf(i)].push(i);
    boxes[boxOf(i)].push(i);
  }
  return [...rows, ...cols, ...boxes];
})();

/** Deterministic PRNG so a seed always reproduces the same puzzle. */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const bitCount = (m) => {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};
const lowestValue = (m) => 32 - Math.clz32(m & -m); // bit 0 -> value 1

export function emptyGrid() {
  return new Array(CELLS).fill(0);
}

/** Candidate bitmasks for every empty cell; `null` if the grid is unsolvable. */
function candidateMasks(grid) {
  const masks = new Array(CELLS).fill(ALL);
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i];
    if (!v) continue;
    masks[i] = 0;
    const bit = 1 << (v - 1);
    for (const p of PEERS[i]) {
      if (grid[p] === v) return null; // duplicate in a unit
      masks[p] &= ~bit;
    }
  }
  for (let i = 0; i < CELLS; i++) {
    if (!grid[i] && masks[i] === 0) return null;
  }
  return masks;
}

/**
 * Count solutions, stopping at `limit`. Used both to solve (limit 1) and to
 * prove uniqueness (limit 2).
 *
 * @returns {{count: number, solution: number[]|null}}
 */
export function countSolutions(grid, limit = 2, rng = null) {
  const work = grid.slice();
  const masks = candidateMasks(work);
  if (!masks) return { count: 0, solution: null };

  let count = 0;
  let solution = null;

  const search = () => {
    // Pick the empty cell with the fewest candidates (MRV heuristic).
    let best = -1;
    let bestSize = 10;
    for (let i = 0; i < CELLS; i++) {
      if (work[i]) continue;
      const size = bitCount(masks[i]);
      if (size === 0) return false;
      if (size < bestSize) {
        bestSize = size;
        best = i;
        if (size === 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (!solution) solution = work.slice();
      return count >= limit;
    }

    let values = [];
    let m = masks[best];
    while (m) {
      values.push(lowestValue(m));
      m &= m - 1;
    }
    if (rng) values = shuffled(values, rng);

    for (const v of values) {
      const bit = 1 << (v - 1);
      const touched = [];
      let dead = false;
      for (const p of PEERS[best]) {
        if (!work[p] && masks[p] & bit) {
          masks[p] &= ~bit;
          touched.push(p);
          if (masks[p] === 0) {
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        work[best] = v;
        const savedMask = masks[best];
        masks[best] = 0;
        if (search()) {
          // Unwind without restoring: we are aborting at the limit.
          for (const p of touched) masks[p] |= bit;
          masks[best] = savedMask;
          work[best] = 0;
          return true;
        }
        masks[best] = savedMask;
        work[best] = 0;
      }
      for (const p of touched) masks[p] |= bit;
    }
    return false;
  };

  search();
  return { count, solution };
}

/** Solve a grid, returning a completed copy or `null`. */
export function solve(grid, rng = null) {
  return countSolutions(grid, 1, rng).solution;
}

/** True when exactly one solution exists. */
export function hasUniqueSolution(grid) {
  return countSolutions(grid, 2).count === 1;
}

/** Build a random completed grid. */
export function generateSolution(rng = createRng()) {
  return solve(emptyGrid(), rng);
}

/**
 * Human-style solver used for difficulty rating. Applies naked singles, hidden
 * singles and locked candidates (pointing / claiming).
 *
 * @returns {{solved: boolean, hardest: number}} hardest technique needed:
 *          0 none, 1 naked single, 2 hidden single, 3 locked candidates,
 *          4 beyond these techniques (guessing / advanced chains).
 */
export function rateLogically(grid) {
  const work = grid.slice();
  const masks = candidateMasks(work);
  if (!masks) return { solved: false, hardest: 4 };
  let hardest = 0;

  const place = (i, v) => {
    work[i] = v;
    masks[i] = 0;
    const bit = 1 << (v - 1);
    for (const p of PEERS[i]) masks[p] &= ~bit;
  };

  for (;;) {
    let progress = false;

    // Naked singles: a cell with a single candidate.
    for (let i = 0; i < CELLS; i++) {
      if (!work[i] && bitCount(masks[i]) === 1) {
        place(i, lowestValue(masks[i]));
        hardest = Math.max(hardest, 1);
        progress = true;
      }
    }
    if (progress) continue;

    // Hidden singles: a value with a single home inside a unit.
    for (const unit of UNITS) {
      for (let v = 1; v <= SIZE && !progress; v++) {
        const bit = 1 << (v - 1);
        let spot = -1;
        let seen = 0;
        let taken = false;
        for (const i of unit) {
          if (work[i] === v) {
            taken = true;
            break;
          }
          if (!work[i] && masks[i] & bit) {
            spot = i;
            seen++;
          }
        }
        if (!taken && seen === 1) {
          place(spot, v);
          hardest = Math.max(hardest, 2);
          progress = true;
        }
      }
      if (progress) break;
    }
    if (progress) continue;

    // Locked candidates: a value confined to the intersection of two units.
    outer: for (const unit of UNITS) {
      for (let v = 1; v <= SIZE; v++) {
        const bit = 1 << (v - 1);
        const spots = unit.filter((i) => !work[i] && masks[i] & bit);
        if (spots.length < 2 || spots.length > 3) continue;
        for (const other of UNITS) {
          if (other === unit) continue;
          if (!spots.every((i) => other.includes(i))) continue;
          let removed = false;
          for (const i of other) {
            if (!work[i] && !spots.includes(i) && masks[i] & bit) {
              masks[i] &= ~bit;
              removed = true;
            }
          }
          if (removed) {
            hardest = Math.max(hardest, 3);
            progress = true;
            break outer;
          }
        }
      }
    }
    if (!progress) break;
  }

  const solved = work.every((v) => v !== 0);
  return { solved, hardest: solved ? hardest : 4 };
}

/**
 * Difficulty bands. `clues` is the target number of givens, `maxTechnique` the
 * hardest technique the puzzle may require (see `rateLogically`).
 */
export const DIFFICULTIES = {
  easy: { label: 'Easy', clues: 42, maxTechnique: 1, minTechnique: 0 },
  medium: { label: 'Medium', clues: 34, maxTechnique: 2, minTechnique: 2 },
  hard: { label: 'Hard', clues: 29, maxTechnique: 3, minTechnique: 3 },
  expert: { label: 'Expert', clues: 25, maxTechnique: 4, minTechnique: 4 },
};

function dig(solution, target, rng) {
  const puzzle = solution.slice();
  let given = CELLS;
  // Remove cells in pairs symmetric about the centre for a tidier board.
  const order = shuffled(
    Array.from({ length: CELLS }, (_, i) => i).filter((i) => i <= CELLS - 1 - i),
    rng
  );
  for (const i of order) {
    if (given <= target) break;
    const mirror = CELLS - 1 - i;
    const pick = i === mirror ? [i] : [i, mirror];
    if (given - pick.length < target - 1) continue;
    const saved = pick.map((c) => puzzle[c]);
    pick.forEach((c) => (puzzle[c] = 0));
    if (hasUniqueSolution(puzzle)) {
      given -= pick.length;
    } else {
      pick.forEach((c, k) => (puzzle[c] = saved[k]));
    }
  }
  return puzzle;
}

/**
 * Generate a puzzle with a unique solution.
 *
 * @param {keyof DIFFICULTIES} difficulty
 * @param {number} [seed]
 * @returns {{puzzle: number[], solution: number[], difficulty: string, seed: number}}
 */
export function generatePuzzle(difficulty = 'medium', seed = Math.floor(Math.random() * 2 ** 31)) {
  const key = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const spec = DIFFICULTIES[key];
  const rng = createRng(seed);
  let fallback = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const solution = generateSolution(rng);
    const puzzle = dig(solution, spec.clues, rng);
    const rating = rateLogically(puzzle);
    const result = { puzzle, solution, difficulty: key, seed };
    if (rating.hardest <= spec.maxTechnique && rating.hardest >= spec.minTechnique) return result;
    if (!fallback || Math.abs(rating.hardest - spec.maxTechnique) < 2) fallback = result;
  }
  return fallback;
}

/** Indices of cells that duplicate a value inside one of their units. */
export function findConflicts(grid) {
  const bad = new Set();
  for (const unit of UNITS) {
    const seen = new Map();
    for (const i of unit) {
      const v = grid[i];
      if (!v) continue;
      if (seen.has(v)) {
        bad.add(i);
        bad.add(seen.get(v));
      } else {
        seen.set(v, i);
      }
    }
  }
  return bad;
}

/** True when every cell is filled and no unit repeats a value. */
export function isComplete(grid) {
  return grid.every((v) => v !== 0) && findConflicts(grid).size === 0;
}

/** How many times each value 1..9 already appears (index 0 unused). */
export function valueCounts(grid) {
  const counts = new Array(SIZE + 1).fill(0);
  for (const v of grid) if (v) counts[v]++;
  return counts;
}
