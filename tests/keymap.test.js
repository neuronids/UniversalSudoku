import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIONS,
  DEFAULT_KEYMAP,
  actionForKey,
  bindKey,
  canonicalKey,
  groupedActions,
  isBindableKey,
  keyLabel,
  PLACE_ACTIONS,
  placedValue,
  placementLabels,
  sanitizeKeymap,
} from '../src/keymap.js';

test('every action has a default binding', () => {
  for (const { action } of ACTIONS) {
    assert.equal(typeof DEFAULT_KEYMAP[action], 'string');
    assert.ok(DEFAULT_KEYMAP[action].length > 0, action);
  }
});

test('no two actions start out on the same key', () => {
  const keys = Object.values(DEFAULT_KEYMAP);
  assert.equal(new Set(keys).size, keys.length);
});

test('the four arrows move, out of the box', () => {
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'ArrowUp'), 'moveUp');
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'ArrowDown'), 'moveDown');
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'ArrowLeft'), 'moveLeft');
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'ArrowRight'), 'moveRight');
});

test('moving around is the first group shown', () => {
  const groups = groupedActions();
  assert.equal(groups[0].title, 'Moving around');
  assert.equal(groups[1].title, 'Placing a colour');
  assert.equal(groups[0].bindings[0].action, 'moveUp');
  assert.equal(
    groups.reduce((n, g) => n + g.bindings.length, 0),
    ACTIONS.length
  );
});

test('a letter matches whatever case it is typed in', () => {
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'N'), 'notes');
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'n'), 'notes');
  assert.equal(canonicalKey('T'), 't');
  assert.equal(canonicalKey('ArrowUp'), 'ArrowUp');
});

test('an unbound key runs nothing', () => {
  assert.equal(actionForKey(DEFAULT_KEYMAP, 'q'), null);
});

test('only the keys a page cannot do without are held back', () => {
  assert.equal(isBindableKey('Enter'), false);
  assert.equal(isBindableKey(' '), false);
  assert.equal(isBindableKey('Shift'), false);
  assert.equal(isBindableKey(''), false);
  // Tab and the digits are ordinary keys, bindable like any other.
  assert.equal(isBindableKey('Tab'), true);
  assert.equal(isBindableKey('4'), true);
  assert.equal(isBindableKey('w'), true);
  assert.equal(isBindableKey('ArrowUp'), true);
});

test('the digits place a colour, out of the box', () => {
  for (let v = 1; v <= 9; v++) {
    assert.equal(actionForKey(DEFAULT_KEYMAP, String(v)), `place${v}`);
    assert.equal(placedValue(`place${v}`), v);
  }
  assert.equal(placedValue('moveUp'), null);
  assert.deepEqual(PLACE_ACTIONS.length, 9);
});

test('the placing keys read as a range until one of them moves', () => {
  assert.deepEqual(placementLabels(DEFAULT_KEYMAP), ['1 – 9']);
  const moved = bindKey(DEFAULT_KEYMAP, 'place1', 'q');
  assert.deepEqual(placementLabels(moved), ['Q', '2', '3', '4', '5', '6', '7', '8', '9']);
});

test('binding a key releases it from whoever held it', () => {
  const next = bindKey(DEFAULT_KEYMAP, 'moveUp', 'z');
  assert.equal(next.moveUp, 'z');
  assert.equal(next.undo, '');
  assert.equal(actionForKey(next, 'z'), 'moveUp');
  // The original is untouched.
  assert.equal(DEFAULT_KEYMAP.undo, 'z');
});

test('Tab and a digit can be taken over like anything else', () => {
  const tabbed = bindKey(DEFAULT_KEYMAP, 'nextEmpty', 'Tab');
  assert.equal(actionForKey(tabbed, 'Tab'), 'nextEmpty');

  const digit = bindKey(DEFAULT_KEYMAP, 'hint', '5');
  assert.equal(actionForKey(digit, '5'), 'hint');
  assert.equal(digit.place5, '', 'the colour it used to place is now unbound');
});

test('binding an unusable key changes nothing', () => {
  assert.equal(bindKey(DEFAULT_KEYMAP, 'moveUp', 'Enter'), DEFAULT_KEYMAP);
  assert.equal(bindKey(DEFAULT_KEYMAP, 'moveUp', 'Meta'), DEFAULT_KEYMAP);
});

test('sanitizeKeymap fills the gaps and drops the junk', () => {
  const map = sanitizeKeymap({ moveUp: 'W', notes: 'Enter', undo: 42, nonsense: 'x' });
  assert.equal(map.moveUp, 'w');
  assert.equal(map.notes, DEFAULT_KEYMAP.notes);
  assert.equal(map.undo, DEFAULT_KEYMAP.undo);
  assert.equal('nonsense' in map, false);
  assert.deepEqual(sanitizeKeymap(null), DEFAULT_KEYMAP);
  assert.deepEqual(sanitizeKeymap('nope'), DEFAULT_KEYMAP);
});

test('keys are written the way a player would read them', () => {
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel('PageDown'), 'Page Down');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel('n'), 'N');
  assert.equal(keyLabel(''), '—');
});
