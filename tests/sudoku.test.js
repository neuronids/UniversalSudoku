import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CELLS,
  DIFFICULTIES,
  PEERS,
  countSolutions,
  createRng,
  emptyGrid,
  findConflicts,
  generatePuzzle,
  generateSolution,
  hasUniqueSolution,
  isComplete,
  rateLogically,
  solve,
  valueCounts,
} from '../src/sudoku.js';

test('peers cover the row, column and box without the cell itself', () => {
  assert.equal(PEERS[0].length, 20);
  assert.ok(!PEERS[0].includes(0));
  assert.ok(PEERS[0].includes(1)); // same row
  assert.ok(PEERS[0].includes(9)); // same column
  assert.ok(PEERS[0].includes(10)); // same box
  assert.ok(!PEERS[0].includes(40));
});

test('a generated solution is a valid complete grid', () => {
  const grid = generateSolution(createRng(7));
  assert.equal(grid.length, CELLS);
  assert.ok(isComplete(grid));
  assert.deepEqual(valueCounts(grid).slice(1), new Array(9).fill(9));
});

test('the same seed always produces the same solution', () => {
  assert.deepEqual(generateSolution(createRng(42)), generateSolution(createRng(42)));
  assert.notDeepEqual(generateSolution(createRng(42)), generateSolution(createRng(43)));
});

test('solving an empty grid succeeds and solving a contradictory one does not', () => {
  assert.ok(isComplete(solve(emptyGrid())));

  const broken = emptyGrid();
  broken[0] = 1;
  broken[1] = 1; // same row, twice
  assert.equal(solve(broken), null);
  assert.equal(countSolutions(broken).count, 0);
});

test('countSolutions stops at the limit', () => {
  // One clue leaves an enormous number of completions; we only want to know
  // that there is more than one.
  const sparse = emptyGrid();
  sparse[0] = 5;
  assert.equal(countSolutions(sparse, 2).count, 2);
});

test('a grid missing one value has exactly one solution', () => {
  const grid = generateSolution(createRng(11));
  grid[40] = 0;
  assert.ok(hasUniqueSolution(grid));
});

test('findConflicts reports both cells of a duplicate and nothing otherwise', () => {
  const grid = generateSolution(createRng(3));
  assert.equal(findConflicts(grid).size, 0);

  const clash = grid.slice();
  clash[1] = clash[0]; // duplicate inside the first row and box
  const bad = findConflicts(clash);
  assert.ok(bad.has(0));
  assert.ok(bad.has(1));
});

test('isComplete needs both a full grid and no clashes', () => {
  const grid = generateSolution(createRng(5));
  assert.ok(isComplete(grid));

  const hole = grid.slice();
  hole[0] = 0;
  assert.ok(!isComplete(hole));

  const clash = grid.slice();
  clash[1] = clash[0];
  assert.ok(!isComplete(clash));
});

test('rateLogically solves an easy grid with singles alone', () => {
  const { puzzle } = generatePuzzle('easy', 2024);
  const rating = rateLogically(puzzle);
  assert.ok(rating.solved);
  assert.ok(rating.hardest <= DIFFICULTIES.easy.maxTechnique);
});

for (const [key, spec] of Object.entries(DIFFICULTIES)) {
  test(`generatePuzzle('${key}') is unique, solvable and about the right size`, () => {
    const { puzzle, solution } = generatePuzzle(key, 1234);

    assert.ok(hasUniqueSolution(puzzle), 'puzzle must have exactly one solution');
    assert.deepEqual(solve(puzzle), solution, 'the stated solution must be the solution');

    // Every clue has to agree with the solution it came from.
    puzzle.forEach((v, i) => {
      if (v) assert.equal(v, solution[i], `clue at ${i} disagrees with the solution`);
    });

    const clues = puzzle.filter(Boolean).length;
    assert.ok(clues >= spec.clues - 2 && clues <= spec.clues + 6, `unexpected clue count ${clues}`);

    const rating = rateLogically(puzzle);
    assert.ok(rating.hardest <= spec.maxTechnique, `too hard for ${key}: ${rating.hardest}`);
  });
}

test('generatePuzzle falls back to medium for an unknown difficulty', () => {
  const { difficulty, puzzle } = generatePuzzle('impossible', 99);
  assert.equal(difficulty, 'medium');
  assert.ok(hasUniqueSolution(puzzle));
});
