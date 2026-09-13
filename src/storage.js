/**
 * Persistence. Everything lives in localStorage under one namespace and every
 * read is defensive: a corrupt or outdated entry falls back to defaults rather
 * than breaking the app.
 */

import { DEFAULT_PALETTE_ID, SWATCH_COUNT, getPreset, sanitizeColors, isValidHex, normalizeHex } from './palettes.js';
import { DEFAULT_KEYMAP, sanitizeKeymap } from './keymap.js';

const STORAGE_PREFIX = 'sudoku-color:';
const KEYS = {
  settings: STORAGE_PREFIX + 'settings',
  game: STORAGE_PREFIX + 'game',
  stats: STORAGE_PREFIX + 'stats',
  customPalettes: STORAGE_PREFIX + 'custom-palettes',
};

export const DEFAULT_SETTINGS = {
  paletteId: DEFAULT_PALETTE_ID,
  /** Overrides applied on top of the chosen palette, as `{index: hex}`. */
  overrides: {},
  symbols: 'none', // none | numbers | letters
  cellStyle: 'fill', // fill: the colour floods the cell | shape: a post-it shape in that colour
  monochrome: false, // draw every shape in one ink instead of nine colours
  lastSymbols: 'numbers', // what the symbol toggle turns back on
  theme: 'system', // system | light | dark
  highlightPeers: true, // wash the row and column of the selection in its colour
  highlightSame: true, // outline every cell holding the selected colour
  showMistakes: true, // flag values that clash with the row/column/box
  tellMeWrong: true, // flag anything that disagrees with the solution, clash or not
  showRemaining: true, // show how many of each colour are still unplaced
  autoRemoveNotes: true, // clear pencil marks a placement rules out
  timer: true,
  showShortcutBar: true, // the basics printed under the board
  /** `{action: key}`; see keymap.js. */
  keymap: { ...DEFAULT_KEYMAP },
};

const canStore = (() => {
  try {
    const probe = STORAGE_PREFIX + 'probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

/** In-memory stand-in so private-mode browsers still work for one session. */
const memory = new Map();

function readRaw(key) {
  try {
    return canStore ? localStorage.getItem(key) : memory.get(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    if (canStore) localStorage.setItem(key, value);
    else memory.set(key, value);
  } catch {
    // Quota or a locked-down browser: the app still works, it just forgets.
  }
}

function removeRaw(key) {
  try {
    if (canStore) localStorage.removeItem(key);
    else memory.delete(key);
  } catch {
    /* ignore */
  }
}

function readJson(key, fallback) {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function loadSettings() {
  const stored = readJson(KEYS.settings, {});
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in stored)) continue;
    const value = stored[key];
    if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
      if (typeof value === 'boolean') settings[key] = value;
    } else if (key === 'overrides') {
      settings.overrides = sanitizeOverrides(value);
    } else if (key === 'keymap') {
      settings.keymap = sanitizeKeymap(value);
    } else if (typeof value === 'string') {
      settings[key] = value;
    }
  }
  // Shapes used to be a glyph set stamped on a filled cell; they are now a way
  // of drawing the cell, so an older setting carries over to the new home.
  if (settings.symbols === 'shapes') {
    settings.symbols = 'none';
    settings.cellStyle = 'shape';
  }
  if (settings.lastSymbols === 'shapes') settings.lastSymbols = 'numbers';
  if (!getPreset(settings.paletteId) && !getCustomPalette(settings.paletteId)) {
    settings.paletteId = DEFAULT_SETTINGS.paletteId;
  }
  return settings;
}

function sanitizeOverrides(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, hex] of Object.entries(value)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < SWATCH_COUNT && isValidHex(hex)) {
      out[index] = normalizeHex(hex);
    }
  }
  return out;
}

export function saveSettings(settings) {
  writeRaw(KEYS.settings, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Custom palettes saved by the player
// ---------------------------------------------------------------------------

export function loadCustomPalettes() {
  const stored = readJson(KEYS.customPalettes, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({
      id: p.id,
      name: p.name.slice(0, 40),
      description: 'Your palette',
      custom: true,
      colors: sanitizeColors(p.colors),
    }));
}

export function saveCustomPalettes(palettes) {
  writeRaw(KEYS.customPalettes, JSON.stringify(palettes.map(({ id, name, colors }) => ({ id, name, colors }))));
}

export function getCustomPalette(id) {
  return loadCustomPalettes().find((p) => p.id === id) || null;
}

// ---------------------------------------------------------------------------
// Saved game
// ---------------------------------------------------------------------------

export function loadGame() {
  return readJson(KEYS.game, null);
}

export function saveGame(snapshot) {
  writeRaw(KEYS.game, JSON.stringify(snapshot));
}

export function clearGame() {
  removeRaw(KEYS.game);
}

// ---------------------------------------------------------------------------
// Stats: best and last time per difficulty
// ---------------------------------------------------------------------------

export function loadStats() {
  const stored = readJson(KEYS.stats, {});
  const stats = {};
  for (const [difficulty, entry] of Object.entries(stored)) {
    if (!entry || typeof entry !== 'object') continue;
    stats[difficulty] = {
      best: Number.isFinite(entry.best) ? entry.best : null,
      last: Number.isFinite(entry.last) ? entry.last : null,
      played: Number.isFinite(entry.played) ? entry.played : 0,
    };
  }
  return stats;
}

/** Record a win; returns `true` when it beat the previous best. */
export function recordWin(difficulty, seconds) {
  const stats = loadStats();
  const entry = stats[difficulty] || { best: null, last: null, played: 0 };
  const isBest = entry.best === null || seconds < entry.best;
  stats[difficulty] = {
    best: isBest ? seconds : entry.best,
    last: seconds,
    played: entry.played + 1,
  };
  writeRaw(KEYS.stats, JSON.stringify(stats));
  return isBest;
}

export function clearAll() {
  Object.values(KEYS).forEach(removeRaw);
}
