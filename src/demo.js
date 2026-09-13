/**
 * The demo page.
 *
 * `demo.html` is a page *about* the game with the game running inside it: the
 * board halfway down is the real `BoardView`, driven by the real `Game`, over
 * the real generator. Nothing here re-implements sudoku — this file only puts a
 * page-sized frame around the pieces `app.js` already wires together.
 *
 * Two things are deliberately unlike `app.js`:
 *
 *   - Nothing is saved. The demo keeps its settings in a plain object and never
 *     writes them back, so trying the neon palette on the way past cannot walk
 *     over the colours someone chose in the game itself.
 *   - The keyboard is bound to the board, not to the document. A page with
 *     links and prose in it has to keep its own keys: `Space` should scroll,
 *     and `/` should still reach the browser. The shortcuts come alive once the
 *     board has focus, which is also when they mean anything.
 */

import { Game } from './game.js';
import { actionForKey, placedValue } from './keymap.js';
import { colEdge, nextEmpty, rowEdge, stepBy } from './navigation.js';
import { PRESETS, SYMBOL_SETS } from './palettes.js';
import { shapeSprite } from './shapes.js';
import { DEFAULT_SETTINGS } from './storage.js';
import { DIFFICULTIES } from './sudoku.js';
import { applyColors, applyDisplay, applyTheme, resolveColors } from './theme.js';
import { BoardView, PaletteView } from './ui.js';

const $ = (id) => document.getElementById(id);

const refs = {
  stage: $('demo-stage'),
  board: $('demo-board'),
  palette: $('demo-palette'),
  difficulty: $('demo-difficulty'),
  newGame: $('demo-new'),
  undo: $('demo-undo'),
  erase: $('demo-erase'),
  hint: $('demo-hint'),
  status: $('demo-status'),
  presets: $('demo-presets'),
  cellStyle: $('demo-cell-style'),
  symbols: $('demo-symbols'),
  theme: $('demo-theme'),
};

/** The app's defaults, minus the parts of the app the demo does not show. */
let settings = {
  ...DEFAULT_SETTINGS,
  keymap: { ...DEFAULT_SETTINGS.keymap },
  timer: false,
  showShortcutBar: false,
};

/** The colour armed on the palette, or null. */
let activeColor = null;

const HINT_LINE = 'Pick a colour, then the empty cells it belongs in.';
let statusTimer = 0;

const game = new Game();

document.body.append(shapeSprite());

const board = new BoardView(refs.board, {
  onSelect: (index) => game.select(index),
  onActivate: (index) => activateCell(index),
});

const palette = new PaletteView(refs.palette, (value) => pickColor(value));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function updateSettings(patch) {
  // The same pairing the app enforces: colour off means shapes, because nine
  // identical black squares are not a board, and going back to flooded cells
  // brings the colour back with them.
  if (patch.monochrome === true) patch = { ...patch, cellStyle: 'shape' };
  if (patch.cellStyle === 'fill') patch = { ...patch, monochrome: false };
  settings = { ...settings, ...patch };
  applyAppearance();
  render();
}

function applyAppearance() {
  applyColors(refs.stage, resolveColors(settings));
  applyDisplay(refs.stage, settings);
  applyTheme(settings.theme);
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

function startGame(difficulty) {
  activeColor = null;
  game.newGame(DIFFICULTIES[difficulty] ? difficulty : 'easy');
  say();
}

/**
 * A tap on a cell.
 *
 * Exactly the app's rule: a colour only ever lands on an empty cell, and
 * tapping a cell that already holds one puts the armed colour down instead of
 * overwriting anything.
 */
function activateCell(index) {
  game.select(index);
  if (game.finished || activeColor === null) return;

  if (game.isGiven(index) || game.grid[index] !== 0) {
    activeColor = null;
    render();
    return;
  }

  place(index, activeColor);
}

function pickColor(value) {
  activeColor = activeColor === value ? null : value;
  render();
}

function place(index, value) {
  game.setValue(index, value, { autoRemoveNotes: settings.autoRemoveNotes });
  if (game.grid[index] !== game.solution[index]) say('That one is wrong.', 'danger');
  else if (game.conflicts().has(index)) say('That colour clashes here.', 'danger');
}

function goTo(index) {
  if (index === null) return;
  game.select(index);
  board.focus(index);
}

function move(dRow, dCol) {
  const from = game.selected ?? 0;
  goTo(stepBy(from, dRow, dCol));
}

/**
 * The shortcuts, live only while the board has focus.
 *
 * Reusing `actionForKey` keeps the demo honest: these are the same bindings the
 * game ships with, read out of the same table, so the shortcut list printed
 * further down the page cannot drift away from what the board actually does.
 */
function onBoardKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const action = actionForKey(settings.keymap, event.key);
  if (!action) return;

  const value = placedValue(action);
  const selected = game.selected;

  if (value !== null) {
    activeColor = value;
    if (selected !== null && !game.isGiven(selected) && !game.grid[selected]) place(selected, value);
    else render();
    event.preventDefault();
    return;
  }

  const handled = {
    moveUp: () => move(-1, 0),
    moveDown: () => move(1, 0),
    moveLeft: () => move(0, -1),
    moveRight: () => move(0, 1),
    rowStart: () => goTo(rowEdge(selected ?? 0, 'start')),
    rowEnd: () => goTo(rowEdge(selected ?? 0, 'end')),
    colStart: () => goTo(colEdge(selected ?? 0, 'start')),
    colEnd: () => goTo(colEdge(selected ?? 0, 'end')),
    prevEmpty: () => goTo(nextEmpty(game.grid, selected, -1)),
    nextEmpty: () => goTo(nextEmpty(game.grid, selected, 1)),
    erase: () => selected !== null && game.erase(selected),
    undo: () => game.undo(),
    redo: () => game.redo(),
    hint: () => useHint(),
    symbols: () => toggleSymbols(),
    deselect: () => {
      activeColor = null;
      render();
    },
    newGame: () => startGame(refs.difficulty.value),
  }[action];

  if (!handled) return;
  handled();
  event.preventDefault();
}

function useHint() {
  const index = game.hint();
  if (index === null) return;
  board.flash(index);
  say('One colour revealed.');
}

/** Symbols on or off, restoring the set last in use — as the game's `T` does. */
function toggleSymbols() {
  if (settings.cellStyle === 'shape') return;
  if (settings.symbols === 'none') {
    const set = settings.lastSymbols && settings.lastSymbols !== 'none' ? settings.lastSymbols : 'numbers';
    updateSettings({ symbols: set });
  } else {
    updateSettings({ symbols: 'none', lastSymbols: settings.symbols });
  }
}

/**
 * The status line.
 *
 * It falls back to the standing instruction rather than to nothing: on a page
 * somebody has just scrolled into, a blank line under the board is a worse
 * resting state than the line that says how to play. Passing `hold` keeps a
 * message there — the one the win deserves.
 */
function say(message = '', tone = '', { hold = false } = {}) {
  refs.status.textContent = message || HINT_LINE;
  refs.status.dataset.tone = message ? tone : '';
  clearTimeout(statusTimer);
  if (message && !hold) statusTimer = setTimeout(() => say(), 4000);
}

// ---------------------------------------------------------------------------
// The controls beside the board
// ---------------------------------------------------------------------------

/**
 * Build a radio group once and hand back the function that re-checks it, so a
 * repaint never rebuilds a button someone is in the middle of pressing.
 */
function buildSegmented(root, options, onPick) {
  root.textContent = '';
  const built = options.map(({ id, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.textContent = label;
    button.addEventListener('click', () => onPick(id));
    root.append(button);
    return { id, button };
  });

  return (current, { disabled = false } = {}) => {
    for (const { id, button } of built) {
      button.setAttribute('aria-checked', id === current ? 'true' : 'false');
      button.disabled = disabled;
    }
  };
}

const syncCellStyle = buildSegmented(
  refs.cellStyle,
  [
    { id: 'fill', label: 'Colour' },
    { id: 'shape', label: 'Shapes' },
    { id: 'mono', label: 'No colour' },
  ],
  (id) => updateSettings(id === 'mono' ? { monochrome: true } : { cellStyle: id, monochrome: false })
);

const syncSymbols = buildSegmented(
  refs.symbols,
  Object.entries(SYMBOL_SETS).map(([id, set]) => ({ id, label: set.label })),
  (id) => updateSettings({ symbols: id, lastSymbols: id === 'none' ? settings.lastSymbols : id })
);

const syncTheme = buildSegmented(
  refs.theme,
  [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ],
  (id) => updateSettings({ theme: id })
);

const presetCards = PRESETS.map((preset) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'preset';

  const strip = document.createElement('span');
  strip.className = 'preset__strip';
  for (const hex of preset.colors) {
    const chip = document.createElement('i');
    chip.style.background = hex;
    strip.append(chip);
  }

  const name = document.createElement('span');
  name.className = 'preset__name';
  name.textContent = preset.name;

  const desc = document.createElement('span');
  desc.className = 'preset__desc';
  desc.textContent = preset.description;

  card.append(strip, name, desc);
  card.addEventListener('click', () => updateSettings({ paletteId: preset.id, overrides: {} }));
  refs.presets.append(card);
  return { id: preset.id, card };
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  board.render(game, settings, { armed: activeColor });
  palette.render({ active: activeColor, remaining: game.remaining(), settings });

  refs.undo.disabled = game.history.length === 0;
  refs.erase.disabled = game.selected === null || game.isGiven(game.selected);
  refs.hint.disabled = game.finished;
  refs.difficulty.value = game.difficulty;

  const shapeMode = settings.cellStyle === 'shape';
  syncCellStyle(settings.monochrome ? 'mono' : settings.cellStyle);
  // In shape mode the shape is already the second cue, so there is nothing for
  // a number on top of it to add — the game disables the toggle there too.
  syncSymbols(shapeMode ? 'none' : settings.symbols, { disabled: shapeMode });
  syncTheme(settings.theme);

  for (const { id, card } of presetCards) {
    card.setAttribute('aria-pressed', id === settings.paletteId ? 'true' : 'false');
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

refs.board.addEventListener('keydown', onBoardKey);
refs.difficulty.addEventListener('change', () => startGame(refs.difficulty.value));
refs.newGame.addEventListener('click', () => startGame(refs.difficulty.value));
refs.undo.addEventListener('click', () => game.undo());
refs.erase.addEventListener('click', () => game.selected !== null && game.erase(game.selected));
refs.hint.addEventListener('click', () => useHint());

game.addEventListener('change', () => render());
game.addEventListener('win', () => {
  activeColor = null;
  say('Solved. The full game keeps your time and asks for another.', 'good', { hold: true });
});

applyAppearance();
// Easy by default: the point of the board on this page is that the colours make
// sense within a few taps, not that the puzzle is a fight.
startGame('easy');
render();
