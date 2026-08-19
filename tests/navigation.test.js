import assert from 'node:assert/strict';
import test from 'node:test';

import { colEdge, nextEmpty, rowEdge, stepBy } from '../src/navigation.js';
import { CELLS } from '../src/sudoku.js';

test('stepBy moves one cell at a time', () => {
  assert.equal(stepBy(0, 0, 1), 1);
  assert.equal(stepBy(0, 1, 0), 9);
  assert.equal(stepBy(40, -1, 0), 31);
  assert.equal(stepBy(40, 0, -1), 39);
});

test('stepBy stops at the edges instead of wrapping to the next row', () => {
  assert.equal(stepBy(0, -1, 0), 0, 'up from the top row');
  assert.equal(stepBy(0, 0, -1), 0, 'left from the first column');
  assert.equal(stepBy(8, 0, 1), 8, 'right from the last column stays put');
  assert.equal(stepBy(80, 1, 1), 80, 'down and right from the last cell');
  assert.equal(stepBy(9, 0, -1), 9, 'left from column 0 does not land on cell 8');
});

test('rowEdge finds the ends of the row', () => {
  assert.equal(rowEdge(4, 'start'), 0);
  assert.equal(rowEdge(4, 'end'), 8);
  assert.equal(rowEdge(40, 'start'), 36);
  assert.equal(rowEdge(40, 'end'), 44);
  assert.equal(rowEdge(80, 'start'), 72);
});

test('colEdge finds the top and bottom of the column', () => {
  assert.equal(colEdge(40, 'start'), 4);
  assert.equal(colEdge(40, 'end'), 76);
  assert.equal(colEdge(0, 'start'), 0);
  assert.equal(colEdge(8, 'end'), 80);
});

test('nextEmpty walks forwards and skips filled cells', () => {
  const grid = new Array(CELLS).fill(0);
  grid[1] = 5;
  grid[2] = 5;
  assert.equal(nextEmpty(grid, 0, 1), 3);
  assert.equal(nextEmpty(grid, 3, 1), 4);
});

test('nextEmpty walks backwards', () => {
  const grid = new Array(CELLS).fill(0);
  grid[3] = 5;
  assert.equal(nextEmpty(grid, 4, -1), 2);
  assert.equal(nextEmpty(grid, 1, -1), 0);
});

test('nextEmpty wraps around the end of the board', () => {
  const grid = new Array(CELLS).fill(0);
  assert.equal(nextEmpty(grid, 80, 1), 0, 'forwards past the last cell');
  assert.equal(nextEmpty(grid, 0, -1), 80, 'backwards past the first cell');
});

test('nextEmpty starts at the board edge when nothing is selected', () => {
  const grid = new Array(CELLS).fill(0);
  assert.equal(nextEmpty(grid, null, 1), 0);
  assert.equal(nextEmpty(grid, null, -1), 80);
});

test('nextEmpty skips the cell it started on', () => {
  const grid = new Array(CELLS).fill(0);
  assert.equal(nextEmpty(grid, 20, 1), 21, 'an empty starting cell is not the answer');
});

test('nextEmpty returns null when the board is full', () => {
  const grid = new Array(CELLS).fill(7);
  assert.equal(nextEmpty(grid, 0, 1), null);
  assert.equal(nextEmpty(grid, null, 1), null);
});

test('nextEmpty finds the only gap from anywhere', () => {
  const grid = new Array(CELLS).fill(7);
  grid[55] = 0;
  for (const from of [0, 54, 55, 56, 80]) {
    assert.equal(nextEmpty(grid, from, 1), 55, `forwards from ${from}`);
    assert.equal(nextEmpty(grid, from, -1), 55, `backwards from ${from}`);
  }
});
