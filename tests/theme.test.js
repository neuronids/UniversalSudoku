import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';

class MemoryStorage {
  #map = new Map();
  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }
  setItem(key, value) {
    this.#map.set(key, String(value));
  }
  removeItem(key) {
    this.#map.delete(key);
  }
  clear() {
    this.#map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

let theme;
let storage;

before(async () => {
  theme = await import('../src/theme.js');
  storage = await import('../src/storage.js');
});

beforeEach(() => globalThis.localStorage.clear());

const base = () => ({ paletteId: 'pastel', overrides: {}, symbols: 'none' });

test('allPalettes lists the presets, then any saved ones', () => {
  assert.equal(theme.allPalettes().length, 6);
  storage.saveCustomPalettes([{ id: 'mine', name: 'Mine', colors: new Array(9).fill('#101010') }]);
  const all = theme.allPalettes();
  assert.equal(all.length, 7);
  assert.equal(all.at(-1).id, 'mine');
  assert.ok(all.at(-1).custom);
});

test('findPalette falls back to pastel for an unknown id', () => {
  assert.equal(theme.findPalette('vibrant').id, 'vibrant');
  assert.equal(theme.findPalette('nonsense').id, 'pastel');
});

test('resolveColors applies overrides on top of the chosen palette', () => {
  const pastel = theme.findPalette('pastel').colors;
  assert.deepEqual(theme.resolveColors(base()), pastel);

  const patched = theme.resolveColors({ ...base(), overrides: { 0: '#ff0000', 8: '#00ff00' } });
  assert.equal(patched[0], '#ff0000');
  assert.equal(patched[8], '#00ff00');
  assert.deepEqual(patched.slice(1, 8), pastel.slice(1, 8));
});

test('resolveColors ignores out-of-range override slots', () => {
  const colors = theme.resolveColors({ ...base(), overrides: { 9: '#ff0000', 20: '#00ff00' } });
  assert.deepEqual(colors, theme.findPalette('pastel').colors);
});

test('resolveColors works for a saved custom palette', () => {
  storage.saveCustomPalettes([{ id: 'mine', name: 'Mine', colors: new Array(9).fill('#101010') }]);
  assert.deepEqual(theme.resolveColors({ ...base(), paletteId: 'mine' }), new Array(9).fill('#101010'));
});

test('glyphFor returns the right symbol for each set', () => {
  assert.equal(theme.glyphFor(base(), 3), '');
  assert.equal(theme.glyphFor({ ...base(), symbols: 'numbers' }, 3), '3');
  assert.equal(theme.glyphFor({ ...base(), symbols: 'letters' }, 1), 'A');
  assert.equal(theme.glyphFor({ ...base(), symbols: 'shapes' }, 9), '✦');
  assert.equal(theme.glyphFor({ ...base(), symbols: 'made-up' }, 3), '');
});

test('applyColors writes fill, ring and ink for all nine values', () => {
  const written = new Map();
  const stub = { style: { setProperty: (k, v) => written.set(k, v) } };
  theme.applyColors(stub, theme.findPalette('vibrant').colors);

  assert.equal(written.size, 27);
  for (let i = 1; i <= 9; i++) {
    for (const prefix of ['--c', '--r', '--i']) {
      assert.match(written.get(`${prefix}${i}`), /^#[0-9a-f]{6}$/, `${prefix}${i} must be a hex colour`);
    }
  }
  assert.equal(written.get('--c1'), theme.findPalette('vibrant').colors[0]);
});

test('valueLabel names a value by its number, not its colour', () => {
  assert.equal(theme.valueLabel(1), 'number 1');
  assert.equal(theme.valueLabel(9), 'number 9');
});

test('applyTheme only ever sets a known value', () => {
  const root = { dataset: {} };
  globalThis.document = { documentElement: root };

  theme.applyTheme('dark');
  assert.equal(root.dataset.theme, 'dark');
  theme.applyTheme('light');
  assert.equal(root.dataset.theme, 'light');
  theme.applyTheme('whatever');
  assert.equal(root.dataset.theme, 'system');

  delete globalThis.document;
});
