/**
 * Bootstrap: wires the game, the views and the settings sheet together, and
 * owns the bits of state that only matter to the UI (the armed colour, notes
 * mode, the timer tick and persistence).
 */

import { Game } from './game.js';
import { colEdge, nextEmpty, rowEdge, stepBy } from './navigation.js';
import { formatPuzzleLink, matchesPuzzle, parsePuzzleHash } from './share.js';
import { DIFFICULTIES } from './sudoku.js';
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
import { applyColors, applyTheme, glyphFor, resolveColors } from './theme.js';
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
  openShortcuts: $('open-shortcuts'),
  share: $('share'),
  footerSettings: $('footer-settings'),
  undo: $('undo'),
  redo: $('redo'),
  erase: $('erase'),
  notes: $('notes'),
  hint: $('hint'),
  symbolsToggle: $('symbols-toggle'),
  symbolsGlyph: $('symbols-glyph'),
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
  shortcuts: {
    dialog: $('shortcuts'),
    body: $('shortcuts-body'),
  },
  shareSheet: {
    dialog: $('share-sheet'),
    link: $('share-link'),
    copy: $('share-copy'),
    status: $('share-status'),
  },
  win: {
    dialog: $('win'),
    ribbon: $('win-ribbon'),
    title: $('win-title'),
    stats: $('win-stats'),
    again: $('win-again'),
    share: $('win-share'),
    close: $('win-close'),
  },
};

/**
 * The shortcut list, rendered into the `?` sheet.
 * `Tab` is deliberately absent from the bindings themselves: the board is one
 * tab stop with a roving tabindex, so Tab has to keep working as the way out of
 * the grid to the palette and buttons. `[` and `]` do the empty-cell jumping.
 */
const SHORTCUTS = [
  {
    title: 'Moving around',
    rows: [
      [['↑', '↓', '←', '→'], 'Move one cell'],
      [['Home', 'End'], 'Start or end of the row'],
      [['Page Up', 'Page Down'], 'Top or bottom of the column'],
      [['[', ']'], 'Previous or next empty cell'],
      [['Tab'], 'Leave the board'],
    ],
  },
  {
    title: 'Playing',
    rows: [
      [['1 – 9'], 'Place that colour'],
      [['Backspace', 'Delete', '0'], 'Clear the cell'],
      [['N'], 'Pencil marks on or off'],
      [['Z', 'Y'], 'Undo or redo'],
      [['H'], 'Reveal one colour'],
      [['T'], 'Symbols on or off'],
      [['Esc'], 'Put the current colour down'],
    ],
  },
  {
    title: 'Everything else',
    rows: [
      [['P'], 'Pause'],
      [['S'], 'Colours and settings'],
      [['?'], 'This list'],
    ],
  },
];

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

/**
 * Turn symbols on or off.
 *
 * Turning them on restores the set last in use rather than always jumping to
 * numbers, so someone playing with shapes keeps their shapes.
 */
function toggleSymbols(on = settings.symbols === 'none') {
  if (on) {
    const set = settings.lastSymbols && settings.lastSymbols !== 'none' ? settings.lastSymbols : 'numbers';
    updateSettings({ symbols: set });
  } else {
    updateSettings({ symbols: 'none', lastSymbols: settings.symbols });
  }
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
  toggleSymbols,
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
  board.render(game, settings, { armed: activeColor });
  palette.render({ active: activeColor, remaining: game.remaining(), settings });

  const symbolsOn = settings.symbols !== 'none';
  refs.symbolsToggle.setAttribute('aria-pressed', symbolsOn ? 'true' : 'false');
  refs.symbolsGlyph.textContent = glyphFor(
    { symbols: symbolsOn ? settings.symbols : settings.lastSymbols || 'numbers' },
    1
  );

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

/**
 * Put the current puzzle's link on screen.
 *
 * The link is shown in a selectable field as well as copied, because the
 * clipboard API is unavailable in some embedded and non-secure contexts — the
 * dialog has to stay useful when the copy silently fails.
 */
function openShare() {
  const link = formatPuzzleLink(location.href, { difficulty: game.difficulty, seed: game.seed });
  refs.shareSheet.link.value = link;
  refs.shareSheet.status.textContent = '';
  refs.shareSheet.status.dataset.tone = '';
  if (!refs.shareSheet.dialog.open) refs.shareSheet.dialog.showModal();
  refs.shareSheet.link.select();
}

async function copyShareLink() {
  const { link, status } = refs.shareSheet;
  link.select();
  try {
    await navigator.clipboard.writeText(link.value);
    status.textContent = 'Link copied.';
    status.dataset.tone = 'good';
  } catch {
    status.textContent = 'Copying is blocked here — the link is selected, so copy it yourself.';
    status.dataset.tone = 'danger';
  }
}

/** Start the puzzle a link points at, resuming it if it is already in progress. */
function openSharedPuzzle(puzzle) {
  const saved = loadGame();
  if (matchesPuzzle(saved, puzzle) && game.restore(saved)) {
    refs.difficulty.value = game.difficulty;
    say('Back on the shared puzzle.');
    return;
  }
  game.newGame(puzzle.difficulty, puzzle.seed);
  activeColor = null;
  refs.difficulty.value = game.difficulty;
  say('Shared puzzle — same board as whoever sent it.');
}

function openShortcuts() {
  if (!refs.shortcuts.body.childElementCount) {
    const wrap = document.createElement('div');
    wrap.className = 'shortcuts';

    for (const { title, rows } of SHORTCUTS) {
      const group = document.createElement('section');
      group.className = 'shortcuts__group';

      const heading = document.createElement('h3');
      heading.className = 'shortcuts__title';
      heading.textContent = title;
      group.append(heading);

      for (const [keys, label] of rows) {
        const row = document.createElement('div');
        row.className = 'shortcuts__row';

        const text = document.createElement('span');
        text.className = 'shortcuts__label';
        text.textContent = label;

        const keyList = document.createElement('span');
        keyList.className = 'shortcuts__keys';
        for (const key of keys) {
          const kbd = document.createElement('kbd');
          kbd.textContent = key;
          keyList.append(kbd);
        }

        row.append(text, keyList);
        group.append(row);
      }
      wrap.append(group);
    }
    refs.shortcuts.body.append(wrap);
  }
  if (!refs.shortcuts.dialog.open) refs.shortcuts.dialog.showModal();
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

/** Select a cell and put the keyboard on it. */
function goTo(index) {
  if (index === null) return;
  game.select(index);
  board.focus(index);
}

function move(dRow, dCol) {
  goTo(stepBy(game.selected ?? 0, dRow, dCol));
}

/** Jump to the next or previous cell with nothing in it. */
function jumpToEmpty(step) {
  const index = nextEmpty(game.grid, game.selected, step);
  if (index === null) {
    say('Every cell is filled.');
    return;
  }
  goTo(index);
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
      // This is no longer the puzzle the link points at; replaceState keeps it
      // out of history and fires no hashchange.
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
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

refs.symbolsToggle.addEventListener('click', () => {
  toggleSymbols();
  say(settings.symbols === 'none' ? 'Symbols off.' : 'Symbols on.');
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

refs.openShortcuts.addEventListener('click', () => openShortcuts());
refs.share.addEventListener('click', () => openShare());
refs.shareSheet.copy.addEventListener('click', () => copyShareLink());
refs.openSettings.addEventListener('click', () => sheet.open());
refs.footerSettings.addEventListener('click', () => sheet.open());
refs.settings.dialog.addEventListener('close', () => render());

refs.win.again.addEventListener('click', () => {
  refs.win.dialog.close();
  startGame(refs.difficulty.value, { force: true });
});
refs.win.share.addEventListener('click', () => {
  refs.win.dialog.close();
  openShare();
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
  if ([refs.settings.dialog, refs.shortcuts.dialog, refs.shareSheet.dialog, refs.win.dialog].some((d) => d.open)) return;

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
    case 'Home':
      event.preventDefault();
      goTo(rowEdge(game.selected ?? 0, 'start'));
      break;
    case 'End':
      event.preventDefault();
      goTo(rowEdge(game.selected ?? 0, 'end'));
      break;
    case 'PageUp':
      event.preventDefault();
      goTo(colEdge(game.selected ?? 0, 'start'));
      break;
    case 'PageDown':
      event.preventDefault();
      goTo(colEdge(game.selected ?? 0, 'end'));
      break;
    case '[':
      event.preventDefault();
      jumpToEmpty(-1);
      break;
    case ']':
      event.preventDefault();
      jumpToEmpty(1);
      break;
    case '?':
      event.preventDefault();
      openShortcuts();
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
    case 't':
    case 'T':
      refs.symbolsToggle.click();
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

// A link pasted into the address bar of an open tab changes the hash without
// reloading, so the puzzle has to be picked up here too.
window.addEventListener('hashchange', () => {
  const puzzle = parsePuzzleHash(location.hash);
  if (!puzzle) return;
  if (puzzle.seed === game.seed && puzzle.difficulty === game.difficulty) return;
  openSharedPuzzle(puzzle);
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

const sharedPuzzle = parsePuzzleHash(location.hash);
if (sharedPuzzle) {
  openSharedPuzzle(sharedPuzzle);
} else if (!game.restore(loadGame())) {
  game.newGame(refs.difficulty.value);
} else {
  refs.difficulty.value = game.difficulty;
  say('Picked up where you left off.');
}

setInterval(() => {
  if (settings.timer && !game.paused && !game.finished) renderTimer();
}, 500);

render();
