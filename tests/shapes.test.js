import assert from 'node:assert/strict';
import test from 'node:test';

import { SHAPES, shapeFor } from '../src/shapes.js';

test('there is one shape per value', () => {
  assert.equal(SHAPES.length, 9);
  for (let v = 1; v <= 9; v++) assert.equal(shapeFor(v), SHAPES[v - 1]);
});

test('the nine post-it shapes are all there', () => {
  assert.deepEqual(
    SHAPES.map((s) => s.id),
    ['circle', 'square', 'triangle', 'plus', 'minus', 'wave', 'star', 'chevron', 'smile']
  );
});

test('every shape has a name, a path and a way of being drawn', () => {
  for (const shape of SHAPES) {
    assert.ok(shape.name.length > 0, shape.id);
    assert.ok(shape.d.length > 0, shape.id);
    assert.ok(['fill', 'stroke'].includes(shape.kind), shape.id);
  }
});

test('shapes are distinct from one another', () => {
  assert.equal(new Set(SHAPES.map((s) => s.d)).size, 9);
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, 9);
});

test('an out-of-range value falls back rather than throwing', () => {
  assert.equal(shapeFor(0), SHAPES[0]);
  assert.equal(shapeFor(99), SHAPES[0]);
});
