import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { Game, notesToValues } from '../src/game.js';
import { CELLS } from '../src/sudoku.js';

/** A fresh game on a fixed seed, plus the index of the first editable cell. */
function fixture(difficulty = 'easy') {
  const game = new Game();
  game.newGame(difficulty, 4242);
  const empty = game.grid.findIndex((v, i) => !game.isGiven(i));
  return { game, empty };
}

test('a new game starts from the puzzle with the clock running', () => {
  const { game } = fixture();
  assert.deepEqual(game.grid, game.puzzle);
  assert.ok(game.emptyCount() > 0);
  assert.ok(!game.finished);
  assert.ok(!game.paused);
  assert.equal(game.history.length, 0);
});

test('placing, replacing and erasing a value', () => {
  const { game, empty } = fixture();
  const right = game.solution[empty];

  assert.ok(game.setValue(empty, right));
  assert.equal(game.grid[empty], right);

  const other = (right % 9) + 1;
  assert.ok(game.setValue(empty, other));
  assert.equal(game.grid[empty], other);

  assert.ok(game.erase(empty));
  assert.equal(game.grid[empty], 0);
  assert.ok(!game.erase(empty), 'erasing an already-empty cell changes nothing');
});

test('givens cannot be changed', () => {
  const { game } = fixture();
  const given = game.grid.findIndex((v, i) => game.isGiven(i));
  const before = game.grid[given];
  assert.ok(!game.setValue(given, 5));
  assert.ok(!game.erase(given));
  assert.ok(!game.toggleNote(given, 5));
  assert.equal(game.grid[given], before);
});

test('pencil marks toggle and are reported as values', () => {
  const { game, empty } = fixture();
  game.toggleNote(empty, 3);
  game.toggleNote(empty, 7);
  assert.deepEqual(notesToValues(game.notes[empty]), [3, 7]);

  game.toggleNote(empty, 3);
  assert.deepEqual(notesToValues(game.notes[empty]), [7]);
});

test('a placement clears that pencil mark from every peer', () => {
  const { game } = fixture();
  const target = game.grid.findIndex((v, i) => !game.isGiven(i));
  const value = game.solution[target];

  // Mark the value everywhere it could still go.
  const marked = [];
  for (let i = 0; i < CELLS; i++) {
    if (!game.isGiven(i) && i !== target && game.toggleNote(i, value)) marked.push(i);
  }

  game.setValue(target, value);
  const stillMarked = marked.filter((i) => notesToValues(game.notes[i]).includes(value));
  const peers = new Set();
  for (const i of stillMarked) peers.add(i);
  // No peer of the target may still carry the mark.
  for (const i of marked) {
    const sameRow = Math.floor(i / 9) === Math.floor(target / 9);
    const sameCol = i % 9 === target % 9;
    const sameBox =
      Math.floor(Math.floor(i / 9) / 3) === Math.floor(Math.floor(target / 9) / 3) &&
      Math.floor((i % 9) / 3) === Math.floor((target % 9) / 3);
    if (sameRow || sameCol || sameBox) {
      assert.ok(!peers.has(i), `peer ${i} kept a ruled-out mark`);
    }
  }
});

test('autoRemoveNotes can be switched off', () => {
  const { game } = fixture();
  const target = game.grid.findIndex((v, i) => !game.isGiven(i));
  const value = game.solution[target];
  const peer = [...Array(9).keys()]
    .map((c) => Math.floor(target / 9) * 9 + c)
    .find((i) => i !== target && !game.isGiven(i));

  game.toggleNote(peer, value);
  game.setValue(target, value, { autoRemoveNotes: false });
  assert.ok(notesToValues(game.notes[peer]).includes(value));
});

test('undo and redo walk the whole history', () => {
  const { game, empty } = fixture();
  game.setValue(empty, 1);
  game.setValue(empty, 2);
  game.erase(empty);
  assert.equal(game.grid[empty], 0);

  assert.ok(game.undo());
  assert.equal(game.grid[empty], 2);
  assert.ok(game.undo());
  assert.equal(game.grid[empty], 1);
  assert.ok(game.undo());
  assert.equal(game.grid[empty], 0);
  assert.ok(!game.undo(), 'nothing left to undo');

  assert.ok(game.redo());
  assert.equal(game.grid[empty], 1);
  assert.ok(game.redo());
  assert.equal(game.grid[empty], 2);
  assert.ok(game.redo());
  assert.equal(game.grid[empty], 0);
  assert.ok(!game.redo());
});

test('undo restores the pencil marks a placement cleared', () => {
  const { game } = fixture();
  const target = game.grid.findIndex((v, i) => !game.isGiven(i));
  const value = game.solution[target];
  const peer = [...Array(9).keys()]
    .map((c) => Math.floor(target / 9) * 9 + c)
    .find((i) => i !== target && !game.isGiven(i));

  game.toggleNote(peer, value);
  game.setValue(target, value);
  assert.ok(!notesToValues(game.notes[peer]).includes(value));

  game.undo();
  assert.ok(notesToValues(game.notes[peer]).includes(value), 'the mark should come back');
});

test('a new move clears the redo stack', () => {
  const { game, empty } = fixture();
  game.setValue(empty, 1);
  game.undo();
  assert.equal(game.future.length, 1);
  game.setValue(empty, 4);
  assert.equal(game.future.length, 0);
});

test('wrongCells and clearMistakes find values that disagree with the solution', () => {
  const { game, empty } = fixture();
  const wrong = (game.solution[empty] % 9) + 1;
  game.setValue(empty, wrong);
  assert.deepEqual([...game.wrongCells()], [empty]);

  assert.equal(game.clearMistakes(), 1);
  assert.equal(game.grid[empty], 0);
  assert.equal(game.clearMistakes(), 0);
});

test('remaining counts down as colours are placed', () => {
  const { game } = fixture();
  const before = game.remaining();
  const target = game.grid.findIndex((v, i) => !game.isGiven(i));
  const value = game.solution[target];
  game.setValue(target, value);
  assert.equal(game.remaining()[value], before[value] - 1);
});

test('a hint fills the selected cell, or any wrong one', () => {
  const { game, empty } = fixture();
  game.select(empty);
  const index = game.hint();
  assert.equal(index, empty);
  assert.equal(game.grid[empty], game.solution[empty]);
  assert.equal(game.hintsUsed, 1);

  game.select(null);
  const next = game.hint();
  assert.equal(game.grid[next], game.solution[next]);
});

test('filling the board correctly finishes the game and fires win once', () => {
  const { game } = fixture();
  let wins = 0;
  game.addEventListener('win', () => wins++);

  for (let i = 0; i < CELLS; i++) if (!game.isGiven(i)) game.setValue(i, game.solution[i]);

  assert.ok(game.isSolved());
  assert.ok(game.finished);
  assert.equal(wins, 1);
  assert.ok(!game.setValue(0, 1), 'a finished board is read only');
});

test('restart returns to the puzzle and resets the clock', () => {
  const { game, empty } = fixture();
  game.setValue(empty, 5);
  game.hint();
  game.restart();
  assert.deepEqual(game.grid, game.puzzle);
  assert.equal(game.hintsUsed, 0);
  assert.equal(game.history.length, 0);
  assert.ok(!game.finished);
});

test('a snapshot round-trips through restore', () => {
  const { game, empty } = fixture('medium');
  game.setValue(empty, game.solution[empty]);
  const other = game.grid.findIndex((v, i) => !game.isGiven(i) && !v);
  game.toggleNote(other, 6);
  const snapshot = JSON.parse(JSON.stringify(game.snapshot()));

  const copy = new Game();
  assert.ok(copy.restore(snapshot));
  assert.deepEqual(copy.grid, game.grid);
  assert.deepEqual(copy.notes, game.notes);
  assert.deepEqual(copy.solution, game.solution);
  assert.equal(copy.difficulty, game.difficulty);
});

test('restore refuses rubbish rather than half-loading it', () => {
  const game = new Game();
  assert.ok(!game.restore(null));
  assert.ok(!game.restore({}));
  assert.ok(!game.restore({ version: 99, puzzle: [], solution: [], grid: [] }));
  assert.ok(!game.restore({ version: 1, puzzle: [1, 2], solution: [], grid: [] }));

  const short = { version: 1, puzzle: new Array(80).fill(0), solution: new Array(81).fill(1), grid: new Array(81).fill(0) };
  assert.ok(!game.restore(short));
});

test('the timer accumulates while running and holds while paused', async () => {
  const { game } = fixture();
  game.elapsed = 10;
  game.startedAt = Date.now() - 3000;
  assert.equal(game.seconds(), 13);

  game.pause();
  const held = game.seconds();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(game.seconds(), held, 'a paused clock does not move');

  game.resume();
  assert.ok(!game.paused);
});

test('selecting clamps to the board', () => {
  const { game } = fixture();
  game.select(80);
  assert.equal(game.selected, 80);
  game.select(999);
  assert.equal(game.selected, null);
  game.select(null);
  assert.equal(game.selected, null);
});
