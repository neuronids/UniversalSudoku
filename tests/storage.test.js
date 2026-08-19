import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';

/** Minimal localStorage stand-in; storage.js probes it when the module loads. */
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

let storage;
let DEFAULT_SETTINGS;

before(async () => {
  storage = await import('../src/storage.js');
  DEFAULT_SETTINGS = storage.DEFAULT_SETTINGS;
});

beforeEach(() => globalThis.localStorage.clear());

test('settings default when nothing is stored', () => {
  assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);
});

test('settings round-trip', () => {
  storage.saveSettings({ ...DEFAULT_SETTINGS, paletteId: 'vibrant', symbols: 'shapes', timer: false });
  const loaded = storage.loadSettings();
  assert.equal(loaded.paletteId, 'vibrant');
  assert.equal(loaded.symbols, 'shapes');
  assert.equal(loaded.timer, false);
});

test('a corrupt settings blob falls back to the defaults', () => {
  globalThis.localStorage.setItem('sudoku-color:settings', '{not json');
  assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);

  globalThis.localStorage.setItem('sudoku-color:settings', '"a string"');
  assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);
});

test('settings of the wrong type are ignored field by field', () => {
  storage.saveSettings({ ...DEFAULT_SETTINGS, timer: 'yes', highlightPeers: false, paletteId: 42 });
  const loaded = storage.loadSettings();
  assert.equal(loaded.timer, DEFAULT_SETTINGS.timer, 'a non-boolean is dropped');
  assert.equal(loaded.highlightPeers, false, 'a valid boolean is kept');
  assert.equal(loaded.paletteId, DEFAULT_SETTINGS.paletteId, 'a non-string id is dropped');
});

test('an unknown palette id falls back to the default', () => {
  storage.saveSettings({ ...DEFAULT_SETTINGS, paletteId: 'deleted-palette' });
  assert.equal(storage.loadSettings().paletteId, DEFAULT_SETTINGS.paletteId);
});

test('colour overrides are validated by index and by hex', () => {
  storage.saveSettings({
    ...DEFAULT_SETTINGS,
    overrides: { 0: '#ABC', 3: 'not-a-colour', 12: '#ffffff', '-1': '#000000' },
  });
  assert.deepEqual(storage.loadSettings().overrides, { 0: '#aabbcc' });
});

test('custom palettes round-trip and are repaired on the way back', () => {
  storage.saveCustomPalettes([
    { id: 'custom-1', name: 'Mine', colors: ['#000000'] },
    { id: 'custom-2', name: 'Other', colors: new Array(9).fill('#123456') },
  ]);
  const palettes = storage.loadCustomPalettes();
  assert.equal(palettes.length, 2);
  assert.equal(palettes[0].colors.length, 9, 'a short list is padded from the default palette');
  assert.equal(palettes[0].colors[0], '#000000');
  assert.ok(palettes[0].custom);
  assert.equal(storage.getCustomPalette('custom-2').name, 'Other');
  assert.equal(storage.getCustomPalette('nope'), null);
});

test('malformed custom palettes are dropped', () => {
  globalThis.localStorage.setItem('sudoku-color:custom-palettes', JSON.stringify([null, { id: 'x' }, 5]));
  assert.deepEqual(storage.loadCustomPalettes(), []);

  globalThis.localStorage.setItem('sudoku-color:custom-palettes', '{"not":"an array"}');
  assert.deepEqual(storage.loadCustomPalettes(), []);
});

test('a saved palette keeps a settings reference valid', () => {
  storage.saveCustomPalettes([{ id: 'custom-9', name: 'Mine', colors: new Array(9).fill('#112233') }]);
  storage.saveSettings({ ...DEFAULT_SETTINGS, paletteId: 'custom-9' });
  assert.equal(storage.loadSettings().paletteId, 'custom-9');
});

test('the game in progress round-trips and can be cleared', () => {
  assert.equal(storage.loadGame(), null);
  storage.saveGame({ version: 1, grid: [1, 2, 3] });
  assert.deepEqual(storage.loadGame(), { version: 1, grid: [1, 2, 3] });
  storage.clearGame();
  assert.equal(storage.loadGame(), null);
});

test('recordWin tracks the best and last time per difficulty', () => {
  assert.ok(storage.recordWin('easy', 300), 'the first win is always a best');
  assert.ok(!storage.recordWin('easy', 400), 'a slower run is not a best');
  assert.ok(storage.recordWin('easy', 120), 'a faster run is a best');

  const stats = storage.loadStats();
  assert.equal(stats.easy.best, 120);
  assert.equal(stats.easy.last, 120);
  assert.equal(stats.easy.played, 3);
  assert.equal(stats.hard, undefined);
});

test('corrupt stats entries are skipped', () => {
  globalThis.localStorage.setItem(
    'sudoku-color:stats',
    JSON.stringify({ easy: { best: 'fast', last: null, played: 'many' }, hard: null })
  );
  const stats = storage.loadStats();
  assert.deepEqual(stats.easy, { best: null, last: null, played: 0 });
  assert.ok(!('hard' in stats));
});

test('clearAll removes everything the app stored', () => {
  storage.saveSettings({ ...DEFAULT_SETTINGS, symbols: 'shapes' });
  storage.saveGame({ version: 1 });
  storage.recordWin('medium', 60);
  storage.saveCustomPalettes([{ id: 'c', name: 'c', colors: new Array(9).fill('#000000') }]);

  storage.clearAll();

  assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);
  assert.equal(storage.loadGame(), null);
  assert.deepEqual(storage.loadStats(), {});
  assert.deepEqual(storage.loadCustomPalettes(), []);
});
