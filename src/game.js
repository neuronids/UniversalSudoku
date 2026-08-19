/**
 * Game state: the board, pencil marks, undo history, timer and win detection.
 *
 * The class knows nothing about the DOM. It emits `change` after every mutation
 * so the UI can re-render, and `win` once the board is correctly filled.
 */

import {
  CELLS,
  DIFFICULTIES,
  PEERS,
  SIZE,
  findConflicts,
  generatePuzzle,
  isComplete,
  valueCounts,
} from './sudoku.js';

const peersOf = (index) => PEERS[index];

const SNAPSHOT_VERSION = 1;

/** Pencil marks are bitmasks: bit 0 is the value 1. */
const noteBit = (value) => 1 << (value - 1);
export const notesToValues = (mask) => {
  const values = [];
  for (let v = 1; v <= SIZE; v++) if (mask & noteBit(v)) values.push(v);
  return values;
};

export class Game extends EventTarget {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.puzzle = new Array(CELLS).fill(0);
    this.solution = new Array(CELLS).fill(0);
    this.grid = new Array(CELLS).fill(0);
    this.notes = new Array(CELLS).fill(0);
    this.difficulty = 'medium';
    this.seed = 0;
    this.selected = null;
    this.history = [];
    this.future = [];
    this.elapsed = 0;
    this.hintsUsed = 0;
    this.startedAt = null;
    this.finished = false;
    this.paused = false;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start a fresh puzzle. Returns the difficulty actually used. */
  newGame(difficulty = 'medium', seed) {
    const key = DIFFICULTIES[difficulty] ? difficulty : 'medium';
    const { puzzle, solution, seed: usedSeed } = generatePuzzle(key, seed);
    this.reset();
    this.puzzle = puzzle;
    this.solution = solution;
    this.grid = puzzle.slice();
    this.difficulty = key;
    this.seed = usedSeed;
    this.start();
    this.emit('change', { reason: 'new-game' });
    return key;
  }

  /** Rebuild from a snapshot; returns false if it is unusable. */
  restore(snapshot) {
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return false;
    const { puzzle, solution, grid, notes } = snapshot;
    const validGrid = (g) => Array.isArray(g) && g.length === CELLS && g.every((v) => Number.isInteger(v) && v >= 0 && v <= SIZE);
    if (!validGrid(puzzle) || !validGrid(solution) || !validGrid(grid)) return false;

    this.reset();
    this.puzzle = puzzle.slice();
    this.solution = solution.slice();
    this.grid = grid.slice();
    this.notes = Array.isArray(notes) && notes.length === CELLS ? notes.map((n) => (Number.isInteger(n) ? n : 0)) : new Array(CELLS).fill(0);
    this.difficulty = DIFFICULTIES[snapshot.difficulty] ? snapshot.difficulty : 'medium';
    this.seed = Number.isFinite(snapshot.seed) ? snapshot.seed : 0;
    this.elapsed = Number.isFinite(snapshot.elapsed) ? snapshot.elapsed : 0;
    this.hintsUsed = Number.isFinite(snapshot.hintsUsed) ? snapshot.hintsUsed : 0;
    this.finished = isComplete(this.grid);
    if (!this.finished) this.start();
    this.emit('change', { reason: 'restore' });
    return true;
  }

  snapshot() {
    return {
      version: SNAPSHOT_VERSION,
      puzzle: this.puzzle,
      solution: this.solution,
      grid: this.grid,
      notes: this.notes,
      difficulty: this.difficulty,
      seed: this.seed,
      elapsed: this.seconds(),
      hintsUsed: this.hintsUsed,
      savedAt: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // Timer
  // -------------------------------------------------------------------------

  start() {
    if (this.finished) return;
    this.paused = false;
    if (this.startedAt === null) this.startedAt = Date.now();
  }

  pause() {
    if (this.startedAt !== null) {
      this.elapsed += (Date.now() - this.startedAt) / 1000;
      this.startedAt = null;
    }
    this.paused = true;
    this.emit('change', { reason: 'pause' });
  }

  resume() {
    if (this.finished) return;
    this.paused = false;
    this.startedAt = Date.now();
    this.emit('change', { reason: 'resume' });
  }

  /** Whole seconds played so far. */
  seconds() {
    const live = this.startedAt === null ? 0 : (Date.now() - this.startedAt) / 1000;
    return Math.floor(this.elapsed + live);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  isGiven(index) {
    return this.puzzle[index] !== 0;
  }

  conflicts() {
    return findConflicts(this.grid);
  }

  /** Cells holding a value that disagrees with the solution. */
  wrongCells() {
    const wrong = new Set();
    for (let i = 0; i < CELLS; i++) {
      if (this.grid[i] && this.grid[i] !== this.solution[i]) wrong.add(i);
    }
    return wrong;
  }

  /** How many of each value are still unplaced (index 0 unused). */
  remaining() {
    const counts = valueCounts(this.grid);
    return counts.map((n, v) => (v === 0 ? 0 : SIZE - n));
  }

  isSolved() {
    return this.grid.every((v, i) => v === this.solution[i]);
  }

  emptyCount() {
    return this.grid.reduce((n, v) => n + (v ? 0 : 1), 0);
  }

  // -------------------------------------------------------------------------
  // Moves
  // -------------------------------------------------------------------------

  select(index) {
    this.selected = index === null || (index >= 0 && index < CELLS) ? index : null;
    this.emit('change', { reason: 'select' });
  }

  /** Push an undo entry capturing the cells a move is about to touch. */
  #record(cells) {
    this.history.push({
      cells: cells.map((i) => ({ index: i, value: this.grid[i], notes: this.notes[i] })),
      selected: this.selected,
    });
    if (this.history.length > 400) this.history.shift();
    this.future.length = 0;
  }

  /**
   * Place a value (1..9) in a cell. Passing 0 clears it. Givens are immutable.
   *
   * @returns {boolean} whether anything changed
   */
  setValue(index, value, { autoRemoveNotes = true } = {}) {
    if (this.finished || this.isGiven(index)) return false;
    if (this.grid[index] === value && this.notes[index] === 0) return false;

    const touched = [index];
    if (value && autoRemoveNotes) {
      // A placement invalidates that pencil mark everywhere it can see.
      const bit = noteBit(value);
      for (const peer of peersOf(index)) {
        if (this.notes[peer] & bit) touched.push(peer);
      }
    }
    this.#record(touched);

    this.grid[index] = value;
    this.notes[index] = 0;
    if (value && autoRemoveNotes) {
      const bit = noteBit(value);
      for (const peer of peersOf(index)) this.notes[peer] &= ~bit;
    }

    this.#afterMove();
    return true;
  }

  /** Add or remove a pencil mark. Ignored on filled or given cells. */
  toggleNote(index, value) {
    if (this.finished || this.isGiven(index) || this.grid[index]) return false;
    this.#record([index]);
    this.notes[index] ^= noteBit(value);
    this.#afterMove();
    return true;
  }

  /** Clear a cell's value and pencil marks. */
  erase(index) {
    if (this.finished || this.isGiven(index)) return false;
    if (!this.grid[index] && !this.notes[index]) return false;
    this.#record([index]);
    this.grid[index] = 0;
    this.notes[index] = 0;
    this.#afterMove();
    return true;
  }

  /**
   * Reveal one correct value: the selected cell if it is empty or wrong,
   * otherwise a random empty cell.
   *
   * @returns {number|null} the revealed cell index
   */
  hint() {
    if (this.finished) return null;
    let target = null;
    if (this.selected !== null && !this.isGiven(this.selected) && this.grid[this.selected] !== this.solution[this.selected]) {
      target = this.selected;
    } else {
      const empties = [];
      for (let i = 0; i < CELLS; i++) {
        if (!this.isGiven(i) && this.grid[i] !== this.solution[i]) empties.push(i);
      }
      if (!empties.length) return null;
      target = empties[Math.floor(Math.random() * empties.length)];
    }
    this.hintsUsed++;
    this.selected = target;
    this.setValue(target, this.solution[target]);
    return target;
  }

  /** Remove every value that disagrees with the solution. */
  clearMistakes() {
    const wrong = [...this.wrongCells()];
    if (!wrong.length) return 0;
    this.#record(wrong);
    for (const i of wrong) this.grid[i] = 0;
    this.#afterMove();
    return wrong.length;
  }

  /** Back to the starting position, keeping the same puzzle. */
  restart() {
    this.grid = this.puzzle.slice();
    this.notes = new Array(CELLS).fill(0);
    this.history = [];
    this.future = [];
    this.elapsed = 0;
    this.hintsUsed = 0;
    this.finished = false;
    this.startedAt = Date.now();
    this.emit('change', { reason: 'restart' });
  }

  undo() {
    const entry = this.history.pop();
    if (!entry) return false;
    this.future.push({
      cells: entry.cells.map(({ index }) => ({ index, value: this.grid[index], notes: this.notes[index] })),
      selected: this.selected,
    });
    for (const { index, value, notes } of entry.cells) {
      this.grid[index] = value;
      this.notes[index] = notes;
    }
    this.selected = entry.selected;
    this.#syncFinished('undo');
    return true;
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.history.push({
      cells: entry.cells.map(({ index }) => ({ index, value: this.grid[index], notes: this.notes[index] })),
      selected: this.selected,
    });
    for (const { index, value, notes } of entry.cells) {
      this.grid[index] = value;
      this.notes[index] = notes;
    }
    this.selected = entry.selected;
    this.#syncFinished('redo');
    return true;
  }

  /** Re-derive the finished flag after a history jump, resuming or winning. */
  #syncFinished(reason) {
    const solved = this.isSolved();
    if (solved === this.finished) {
      this.emit('change', { reason });
      return;
    }
    this.finished = solved;
    if (solved) {
      this.pause();
      this.emit('change', { reason });
      this.emit('win', { seconds: this.seconds(), hintsUsed: this.hintsUsed, difficulty: this.difficulty });
    } else {
      if (this.startedAt === null && !this.paused) this.startedAt = Date.now();
      this.emit('change', { reason });
    }
  }

  #afterMove() {
    const solved = this.isSolved();
    if (solved && !this.finished) {
      this.finished = true;
      this.pause();
      this.emit('change', { reason: 'move' });
      this.emit('win', { seconds: this.seconds(), hintsUsed: this.hintsUsed, difficulty: this.difficulty });
      return;
    }
    this.emit('change', { reason: 'move' });
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
