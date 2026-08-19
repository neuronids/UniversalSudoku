/**
 * Bootstrap: wires the game, the views and the settings sheet together, and
 * owns the bits of state that only matter to the UI (the armed colour, notes
 * mode, the timer tick and persistence).
 */

import { Game } from './game.js';
import { CELLS, DIFFICULTIES, SIZE, colOf, rowOf } from './sudoku.js';
import { SettingsSheet } from './settings.js';
import {
  clearAll,
  clearGame,
  loadGame,
  loadSettings,
  recordWin,
  saveGame,
  saveSettings,
} from './storage.js';
import { applyColors, applyTheme, resolveColors } from './theme.js';
import { BoardView, PaletteView, formatTime } from './ui.js';

const $ = (id) => document.getElementById(id);

const refs = {
  app: $('app'),
  board: $('board'),
  palette: $('palette'),
  difficulty: $('difficulty'),
  newGame: $('new-game'),
  timerWrap: $('timer-wrap'),
  timer: $('timer'),
  pause: $('pause'),
  openSettings: $('open-settings'),
  footerSettings: $('footer-settings'),
  undo: $('undo'),
  redo: $('redo'),
  erase: $('erase'),
  notes: $('notes'),
  hint: $('hint'),
  status: $('status'),
  veil: $('veil'),
  veilTitle: $('veil-title'),
  veilText: $('veil-text'),
  veilAction: $('veil-action'),
  settings: {
    dialog: $('settings'),
    presets: $('presets'),
    editor: $('editor'),
    notice: $('palette-notice'),
    symbols: $('symbols'),
    theme: $('theme'),
    switches: $('switches'),
    stats: $('stats'),
    savePalette: $('save-palette'),
    resetColors: $('reset-colors'),
    shuffleColors: $('shuffle-colors'),
    resetData: $('reset-data'),
  },
  win: {
    dialog: $('win'),
    ribbon: $('win-ribbon'),
    title: $('win-title'),
    stats: $('win-stats'),
    again: $('win-again'),
    close: $('win-close'),
  },
};

const game = new Game();
let settings = loadSettings();
/** The colour armed on the palette, or `null`. */
let activeColor = null;
let notesMode = false;
let statusTimer = 0;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function updateSettings(patch) {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  applyAppearance();
  render();
}

function applyAppearance() {
  const colors = resolveColors(settings);
  applyColors(refs.app, colors);
  applyTheme(settings.theme);
  paintRibbon(colors);
}

function paintRibbon(colors) {
  refs.win.ribbon.textContent = '';
  for (const hex of colors) {
    const chip = document.createElement('i');
    chip.style.background = hex;
    refs.win.ribbon.append(chip);
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const board = new BoardView(refs.board, {
  onSelect: (index) => game.select(index),
  onActivate: (index) => activateCell(index),
});

const palette = new PaletteView(refs.palette, (value) => pickColor(value));

const sheet = new SettingsSheet(refs.settings, {
  getSettings: () => settings,
  update: updateSettings,
  onReset: () => {
    clearAll();
    settings = loadSettings();
    applyAppearance();
    sheet.close();
    startGame(refs.difficulty.value, { force: true });
    say('Saved data erased.');
  },
});

function render() {
  board.render(game, settings);
  palette.render({ active: activeColor, remaining: game.remaining(), settings });

  refs.undo.disabled = game.history.length === 0;
  refs.redo.disabled = game.future.length === 0;
  refs.notes.setAttribute('aria-pressed', notesMode ? 'true' : 'false');
  refs.erase.disabled = game.selected === null || game.isGiven(game.selected);
  refs.hint.disabled = game.finished;

  refs.timerWrap.hidden = !settings.timer;
  refs.pause.setAttribute('aria-pressed', game.paused ? 'true' : 'false');
  refs.pause.disabled = game.finished;
  renderTimer();
  renderVeil();
}

function renderTimer() {
  refs.timer.textContent = formatTime(game.seconds());
}

function renderVeil() {
  if (game.paused && !game.finished) {
    refs.veil.hidden = false;
    refs.veilTitle.textContent = 'Paused';
    refs.veilText.textContent = 'The board is hidden while the timer is stopped.';
    refs.veilAction.textContent = 'Resume';
  } else {
    refs.veil.hidden = true;
  }
}

function say(message, tone = '') {
  refs.status.textContent = message;
  refs.status.dataset.tone = tone;
  clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => say(''), 4000);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function activateCell(index) {
  if (game.paused || game.finished) {
    game.select(index);
    return;
  }
  game.select(index);
  if (activeColor === null) return;
  if (game.isGiven(index)) return;

  if (notesMode) {
    game.toggleNote(index, activeColor);
  } else if (game.grid[index] === activeColor) {
    game.erase(index);
  } else {
    place(index, activeColor);
  }
}

function pickColor(value) {
  activeColor = activeColor === value ? null : value;
  const index = game.selected;
  if (activeColor !== null && index !== null && !game.isGiven(index) && !game.paused && !game.finished) {
    if (notesMode) game.toggleNote(index, value);
    else if (game.grid[index] !== value) place(index, value);
  }
  render();
}

function place(index, value) {
  game.setValue(index, value, { autoRemoveNotes: settings.autoRemoveNotes });
  // Only report what the board is already showing. Comparing against the
  // solution here would quietly give away wrong answers the "flag clashes"
  // assist never promised to reveal.
  if (settings.showMistakes && game.conflicts().has(index)) {
    say('That colour clashes here.', 'danger');
  }
}

function move(dRow, dCol) {
  const from = game.selected ?? 0;
  const row = Math.min(SIZE - 1, Math.max(0, rowOf(from) + dRow));
  const col = Math.min(SIZE - 1, Math.max(0, colOf(from) + dCol));
  const to = row * SIZE + col;
  game.select(to);
  board.focus(to);
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

function inProgress() {
  if (game.finished) return false;
  return game.grid.some((v, i) => v !== game.puzzle[i]);
}

function startGame(difficulty, { force = false } = {}) {
  if (!force && inProgress() && !confirm('Start a new board? The one in progress will be lost.')) {
    refs.difficulty.value = game.difficulty;
    return;
  }
  say('Dealing colours…');
  refs.newGame.disabled = true;
  // Let the status paint before the generator blocks the thread.
  requestAnimationFrame(() => {
    setTimeout(() => {
      game.newGame(difficulty);
      activeColor = null;
      refs.difficulty.value = game.difficulty;
      refs.newGame.disabled = false;
      say('');
      board.focus(0);
    }, 0);
  });
}

// Moving the selection repaints but changes nothing worth storing, so it does
// not trigger a write.
const TRANSIENT = new Set(['select', 'pause', 'resume']);

game.addEventListener('change', (event) => {
  render();
  if (TRANSIENT.has(event.detail?.reason)) return;
  if (!game.finished) saveGame(game.snapshot());
  else clearGame();
});

game.addEventListener('win', (event) => {
  const { seconds, hintsUsed, difficulty } = event.detail;
  const isBest = recordWin(difficulty, seconds);
  clearGame();
  refs.win.title.textContent = isBest ? 'A new best time' : 'Solved';
  const label = DIFFICULTIES[difficulty]?.label ?? difficulty;
  const hintNote = hintsUsed ? ` · ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}` : '';
  refs.win.stats.textContent = `${label} · ${formatTime(seconds)}${hintNote}`;
  refs.win.dialog.showModal();
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

refs.newGame.addEventListener('click', () => startGame(refs.difficulty.value));
refs.difficulty.addEventListener('change', () => startGame(refs.difficulty.value));

refs.undo.addEventListener('click', () => {
  if (!game.undo()) say('Nothing to undo.');
});

refs.redo.addEventListener('click', () => {
  if (!game.redo()) say('Nothing to redo.');
});

refs.erase.addEventListener('click', () => {
  if (game.selected !== null) game.erase(game.selected);
});

refs.notes.addEventListener('click', () => {
  notesMode = !notesMode;
  say(notesMode ? 'Pencil marks on.' : 'Pencil marks off.');
  render();
});

refs.hint.addEventListener('click', () => {
  const index = game.hint();
  if (index === null) {
    say('Nothing left to reveal.');
    return;
  }
  board.flash(index);
  board.focus(index);
  say('Revealed one colour.', 'good');
});

refs.pause.addEventListener('click', () => (game.paused ? game.resume() : game.pause()));
refs.veilAction.addEventListener('click', () => game.resume());

refs.openSettings.addEventListener('click', () => sheet.open());
refs.footerSettings.addEventListener('click', () => sheet.open());
refs.settings.dialog.addEventListener('close', () => render());

refs.win.again.addEventListener('click', () => {
  refs.win.dialog.close();
  startGame(refs.difficulty.value, { force: true });
});
refs.win.close.addEventListener('click', () => refs.win.dialog.close());

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  const typing = target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable);
  if (typing) return;
  if (refs.settings.dialog.open || refs.win.dialog.open) return;

  const key = event.key;

  if (key >= '1' && key <= '9') {
    event.preventDefault();
    const value = Number(key);
    const index = game.selected;
    if (index === null) {
      activeColor = activeColor === value ? null : value;
      render();
      return;
    }
    activeColor = value;
    if (!game.isGiven(index) && !game.paused && !game.finished) {
      // A digit always places (Backspace clears). Only tapping a cell toggles,
      // where "tap the same colour again" is the natural undo gesture.
      if (notesMode) game.toggleNote(index, value);
      else place(index, value);
    }
    render();
    return;
  }

  switch (key) {
    case 'ArrowUp':
      event.preventDefault();
      move(-1, 0);
      break;
    case 'ArrowDown':
      event.preventDefault();
      move(1, 0);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      move(0, -1);
      break;
    case 'ArrowRight':
      event.preventDefault();
      move(0, 1);
      break;
    case 'Backspace':
    case 'Delete':
    case '0':
      event.preventDefault();
      if (game.selected !== null) game.erase(game.selected);
      break;
    case 'n':
    case 'N':
      refs.notes.click();
      break;
    case 'z':
    case 'Z':
      game.undo();
      break;
    case 'y':
    case 'Y':
      game.redo();
      break;
    case 'h':
    case 'H':
      refs.hint.click();
      break;
    case 'p':
    case 'P':
      refs.pause.click();
      break;
    case 's':
    case 'S':
      sheet.open();
      break;
    case 'Escape':
      if (activeColor !== null) {
        activeColor = null;
        render();
      }
      break;
    default:
      break;
  }
});

// Pause the clock when the tab goes away, so a stopped game is not "played".
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !game.finished && !game.paused) game.pause();
});

window.addEventListener('beforeunload', () => {
  if (!game.finished) saveGame(game.snapshot());
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

applyAppearance();

if (!game.restore(loadGame())) {
  game.newGame(refs.difficulty.value);
} else {
  refs.difficulty.value = game.difficulty;
  say('Picked up where you left off.');
}

setInterval(() => {
  if (settings.timer && !game.paused && !game.finished) renderTimer();
}, 500);

render();
