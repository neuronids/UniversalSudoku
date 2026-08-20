import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPuzzleHash, formatPuzzleLink, matchesPuzzle, parsePuzzleHash } from '../src/share.js';
import { generatePuzzle } from '../src/sudoku.js';

const BASE = 'https://example.com/sudoku/';

test('a puzzle round-trips through its hash', () => {
  for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
    const puzzle = { difficulty, seed: 1234567 };
    assert.deepEqual(parsePuzzleHash(formatPuzzleHash(puzzle)), puzzle);
  }
});

test('formatPuzzleLink replaces the hash rather than appending to it', () => {
  const link = formatPuzzleLink(BASE + 'index.html#puzzle=easy-1', { difficulty: 'hard', seed: 9 });
  assert.equal(link, BASE + 'index.html#puzzle=hard-9');
  assert.equal((link.match(/#/g) || []).length, 1);
});

test('formatPuzzleLink keeps the path and query intact', () => {
  const link = formatPuzzleLink(BASE + 'index.html?debug=1', { difficulty: 'medium', seed: 42 });
  assert.equal(link, BASE + 'index.html?debug=1#puzzle=medium-42');
});

test('parsePuzzleHash accepts a hash with or without the leading hash sign', () => {
  assert.deepEqual(parsePuzzleHash('#puzzle=easy-7'), { difficulty: 'easy', seed: 7 });
  assert.deepEqual(parsePuzzleHash('puzzle=easy-7'), { difficulty: 'easy', seed: 7 });
});

test('parsePuzzleHash rejects anything it does not recognise', () => {
  for (const bad of [
    '',
    '#',
    '#other=medium-1',
    '#puzzle=',
    '#puzzle=medium',
    '#puzzle=medium-',
    '#puzzle=-1',
    '#puzzle=nonsense-1',
    '#puzzle=medium-abc',
    '#puzzle=medium--1',
    '#puzzle=medium-1.5',
    '#puzzle=medium-1e5',
    '#puzzle=medium-99999999999999999999',
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(parsePuzzleHash(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('parsePuzzleHash rejects a seed at or past the generator range', () => {
  assert.equal(parsePuzzleHash('#puzzle=easy-4294967296'), null);
  assert.deepEqual(parsePuzzleHash('#puzzle=easy-4294967295'), { difficulty: 'easy', seed: 4294967295 });
  assert.deepEqual(parsePuzzleHash('#puzzle=easy-0'), { difficulty: 'easy', seed: 0 });
});

test('a link rebuilds the very same board', () => {
  const mine = generatePuzzle('hard', 20260820);
  const link = formatPuzzleLink(BASE, mine);
  const theirs = generatePuzzle(...(({ difficulty, seed }) => [difficulty, seed])(parsePuzzleHash(new URL(link).hash)));

  assert.deepEqual(theirs.puzzle, mine.puzzle, 'same clues');
  assert.deepEqual(theirs.solution, mine.solution, 'same solution');
  assert.equal(theirs.difficulty, mine.difficulty);
});

test('different seeds give different boards', () => {
  const a = generatePuzzle('medium', 1);
  const b = generatePuzzle('medium', 2);
  assert.notDeepEqual(a.puzzle, b.puzzle);
});

test('matchesPuzzle spots the saved game belonging to a link', () => {
  const puzzle = { difficulty: 'medium', seed: 5 };
  assert.ok(matchesPuzzle({ difficulty: 'medium', seed: 5, grid: [] }, puzzle));
  assert.ok(!matchesPuzzle({ difficulty: 'medium', seed: 6 }, puzzle));
  assert.ok(!matchesPuzzle({ difficulty: 'hard', seed: 5 }, puzzle));
  assert.ok(!matchesPuzzle(null, puzzle));
  assert.ok(!matchesPuzzle({ difficulty: 'medium', seed: 5 }, null));
});
