/**
 * Bootstrap: wires the game, the views and the settings sheet together, and
 * owns the bits of state that only matter to the UI (the armed colour, notes
 * mode, the timer tick and persistence).
 */

import { Game } from './game.js';
import { actionForKey, groupedActions, keyLabel, placedValue, placementLabels } from './keymap.js';
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
import { shapeSprite } from './shapes.js';
import { applyColors, applyDisplay, applyTheme, glyphFor, resolveColors } from './theme.js';
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
  shortcutBar: $('shortcut-bar'),
  veil: $('veil'),
  veilTitle: $('veil-title'),
  veilText: $('veil-text'),
  veilAction: $('veil-action'),
  settings: {
    dialog: $('settings'),
    presets: $('presets'),
    editor: $('editor'),
    notice: $('palette-notice'),
    cellStyle: $('cell-style'),
    colourSwitches: $('colour-switches'),
    symbols: $('symbols'),
    theme: $('theme'),
    switches: $('switches'),
    keys: $('keys'),
    resetKeys: $('reset-keys'),
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
  confirm: {
    dialog: $('confirm'),
    title: $('confirm-title'),
    text: $('confirm-text'),
    ok: $('confirm-ok'),
    cancel: $('confirm-cancel'),
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
 * The shortcut list, rendered into the `?` sheet and the bar under the board.
 *
 * Both are built from the live keymap, so a rebound key is written wherever it
 * is mentioned. The nine placing keys collapse into one row while they are
 * still the plain digits, because nine rows saying the obvious would bury the
 * rest of the list.
 *
 * Tab leaves the board — that is the browser's doing, not a binding, so it is
 * listed as a fixed row and only while nothing else has claimed the key.
 */
function shortcutGroups(keymap) {
  const digitsMoved = placementLabels(keymap).length > 1;
  const tabTaken = Object.values(keymap).includes('Tab');

  return groupedActions().map(({ title, bindings }) => {
    const rows = [];
    if (title === 'Moving around' && !tabTaken) rows.push([['Tab'], 'Leave the board']);
    if (title === 'Placing a colour' && !digitsMoved) {
      rows.push([['1 – 9'], 'Place that colour']);
    } else {
      for (const binding of bindings) {
        if (keymap[binding.action]) rows.push([[keyLabel(keymap[binding.action])], binding.label]);
      }
    }
    return { title, rows };
  });
}

/** The handful of keys worth printing under the board. */
const BAR_ITEMS = [
  { keys: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'], label: 'Move' },
  { placing: true, label: 'Place a colour' },
  { keys: ['erase'], label: 'Clear' },
  { keys: ['notes'], label: 'Notes' },
  { keys: ['undo'], label: 'Undo' },
  { keys: ['hint'], label: 'Hint' },
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
  // Colour off and flooded cells cannot both hold: nine identical black squares
  // are not a board. Turning colour off switches to shapes; going back to
  // flooded cells turns colour back on.
  if (patch.monochrome === true) patch = { ...patch, cellStyle: 'shape' };
  if (patch.cellStyle === 'fill') patch = { ...patch, monochrome: false };
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
  applyDisplay(refs.app, settings);
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
  renderShortcutBar();
  palette.render({ active: activeColor, remaining: game.remaining(), settings });

  // In shape mode the shape is the symbol, so a letter or number on top of it
  // has nowhere to go and the toggle has nothing to do.
  const shapeMode = settings.cellStyle === 'shape';
  refs.symbolsToggle.disabled = shapeMode;
  refs.symbolsToggle.title = shapeMode
    ? 'The shapes are already the symbols'
    : `Symbols on the colours (${keyLabel(settings.keymap.symbols)})`;
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

  refs.difficulty.value = game.difficulty;
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

/**
 * Rebuild the `?` sheet from the current bindings.
 *
 * It is thrown away and rebuilt rather than cached, because a rebinding has to
 * show up the next time the sheet is opened.
 */
function openShortcuts() {
  const body = refs.shortcuts.body;
  body.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'shortcuts';

  for (const { title, rows } of shortcutGroups(settings.keymap)) {
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

  const note = document.createElement('p');
  note.className = 'panel__hint';
  note.textContent = 'Any of these can be changed under Keyboard shortcuts in the settings.';
  wrap.append(note);

  body.append(wrap);
  if (!refs.shortcuts.dialog.open) refs.shortcuts.dialog.showModal();
}

/** The one-line reminder under the board. */
function renderShortcutBar() {
  const bar = refs.shortcutBar;
  bar.hidden = !settings.showShortcutBar;
  if (bar.hidden) return;

  bar.textContent = '';
  for (const item of BAR_ITEMS) {
    // Placing keys arrive ready to print; the rest are raw keys to label.
    const labels = item.placing
      ? placementLabels(settings.keymap)
      : item.keys.map((action) => settings.keymap[action]).filter(Boolean).map(keyLabel);
    if (!labels.length) continue;

    const span = document.createElement('span');
    span.className = 'shortcut-bar__item';
    for (const label of labels) {
      const kbd = document.createElement('kbd');
      kbd.textContent = label;
      span.append(kbd);
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    span.append(label);
    bar.append(span);
  }

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'shortcut-bar__more';
  more.textContent = 'All shortcuts';
  more.addEventListener('click', () => openShortcuts());
  bar.append(more);
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

/** Put the armed colour down, if one is armed. */
function disarm() {
  if (activeColor === null) return;
  activeColor = null;
  render();
}

/**
 * A tap on a cell.
 *
 * A colour only ever lands in an empty cell. Tapping a cell that already holds
 * something — a given or your own entry — selects it and puts the armed colour
 * down instead, so the tap reads as "show me this cell" and the cell after it
 * cannot be filled by a colour you had forgotten was armed. Clearing a cell is
 * the Erase button or Backspace, which say so.
 */
function activateCell(index) {
  game.select(index);
  if (game.paused || game.finished) return;
  if (activeColor === null) return;

  if (game.isGiven(index) || game.grid[index] !== 0) {
    disarm();
    return;
  }

  if (notesMode) game.toggleNote(index, activeColor);
  else place(index, activeColor);
}

/**
 * Arm or disarm a colour.
 *
 * Picking a colour never writes to the board on its own — it only says what
 * the next tap on an empty cell will place, and outlines the cells already
 * holding it.
 */
function pickColor(value) {
  activeColor = activeColor === value ? null : value;
  render();
}

function place(index, value) {
  game.setValue(index, value, { autoRemoveNotes: settings.autoRemoveNotes });
  // Each assist reports only what it promised. "Tell me when it's wrong" is the
  // one that compares against the solution, so it is also the only one that can
  // speak up for a wrong colour that clashes with nothing; flagging clashes on
  // its own must not quietly give that away.
  if (settings.tellMeWrong && game.grid[index] !== game.solution[index]) {
    say('That one is wrong.', 'danger');
  } else if (settings.showMistakes && game.conflicts().has(index)) {
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

/**
 * Ask before throwing a board away.
 *
 * This used to be `window.confirm`, which is why changing the difficulty or
 * starting a new game could look broken: a browser that blocks or suppresses
 * dialogs — an embedded view, a tab with "prevent additional dialogs" ticked —
 * returns false without showing anything, so the click did nothing at all and
 * the difficulty snapped back to where it was. An in-page dialog always shows.
 */
function confirmNewGame(onYes) {
  const { dialog, ok, cancel } = refs.confirm;
  const close = () => {
    ok.removeEventListener('click', yes);
    cancel.removeEventListener('click', no);
    if (dialog.open) dialog.close();
  };
  const yes = () => {
    close();
    onYes();
  };
  const no = () => {
    close();
    // The select already moved to the new value, so put it back.
    refs.difficulty.value = game.difficulty;
  };
  ok.addEventListener('click', yes);
  cancel.addEventListener('click', no);
  dialog.addEventListener('cancel', no, { once: true });
  dialog.showModal();
  ok.focus();
}

/**
 * Deal a new board.
 *
 * The generator blocks the thread for a moment, so the status line is painted
 * first. That used to be scheduled through `requestAnimationFrame`, which never
 * fires in a hidden or backgrounded tab — the New game button stayed disabled
 * for good, which is the other half of "I cannot start a new game". A plain
 * timeout always runs, and `finally` puts the button back whatever happens.
 */
function dealNewGame(difficulty) {
  say('Dealing colours…');
  refs.newGame.disabled = true;
  setTimeout(() => {
    try {
      game.newGame(difficulty);
      activeColor = null;
      // This is no longer the puzzle the link points at; replaceState keeps it
      // out of history and fires no hashchange.
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      say('');
      board.focus(0);
    } finally {
      refs.newGame.disabled = false;
      render();
    }
  }, 20);
}

function startGame(difficulty, { force = false } = {}) {
  if (!force && inProgress()) {
    confirmNewGame(() => dealNewGame(difficulty));
    return;
  }
  dealNewGame(difficulty);
}

/** Say how the board stands against the solution, on demand. */
function checkBoard() {
  if (game.finished) {
    say('Solved — nothing to check.', 'good');
    return;
  }
  const wrong = game.wrongCells().size;
  const empty = game.emptyCount();
  if (wrong) {
    say(`${wrong} colour${wrong === 1 ? ' is' : 's are'} wrong.`, 'danger');
    return;
  }
  say(empty ? `All good so far — ${empty} to go.` : 'All nine colours are in the right places.', 'good');
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

// A press anywhere that is not the board or the controls under it puts the
// armed colour down. Without this the colour survives out of sight — you come
// back to the board, tap a cell to look at it, and a shape you no longer
// remember arming lands in it.
//
// pointerdown rather than click, so the colour is already down by the time the
// press turns into a click, and capture so it still runs for handlers that
// stop the event on the way up.
document.addEventListener(
  'pointerdown',
  (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('#board, .controls')) return;
    disarm();
  },
  true
);

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  const typing = target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable);
  if (typing) return;
  const dialogs = [
    refs.settings.dialog,
    refs.shortcuts.dialog,
    refs.shareSheet.dialog,
    refs.confirm.dialog,
    refs.win.dialog,
  ];
  if (dialogs.some((d) => d.open)) return;

  const key = event.key;

  // Delete always clears too: it is what the key is for, and it costs nothing
  // to honour it alongside whatever the clear action is bound to.
  const action = key === 'Delete' ? 'erase' : actionForKey(settings.keymap, key);
  if (!action) return;

  // Every bound key belongs to the board from here on, so none of them scroll
  // the page or type into the document.
  event.preventDefault();
  runAction(action);
});

/** Put a colour in the selected cell from the keyboard. */
function placeByKey(value) {
  const index = game.selected;
  if (index === null) {
    activeColor = activeColor === value ? null : value;
    render();
    return;
  }
  activeColor = value;
  if (!game.isGiven(index) && !game.paused && !game.finished) {
    // A placing key always places (the clear key clears). Only tapping a cell
    // toggles, where "tap the same colour again" is the natural undo gesture.
    if (notesMode) game.toggleNote(index, value);
    else place(index, value);
  }
  render();
}

/** Run a bound action by name. */
function runAction(action) {
  const value = placedValue(action);
  if (value !== null) {
    placeByKey(value);
    return;
  }

  switch (action) {
    case 'moveUp':
      move(-1, 0);
      break;
    case 'moveDown':
      move(1, 0);
      break;
    case 'moveLeft':
      move(0, -1);
      break;
    case 'moveRight':
      move(0, 1);
      break;
    case 'rowStart':
      goTo(rowEdge(game.selected ?? 0, 'start'));
      break;
    case 'rowEnd':
      goTo(rowEdge(game.selected ?? 0, 'end'));
      break;
    case 'colStart':
      goTo(colEdge(game.selected ?? 0, 'start'));
      break;
    case 'colEnd':
      goTo(colEdge(game.selected ?? 0, 'end'));
      break;
    case 'prevEmpty':
      jumpToEmpty(-1);
      break;
    case 'nextEmpty':
      jumpToEmpty(1);
      break;
    case 'erase':
      if (game.selected !== null) game.erase(game.selected);
      break;
    case 'notes':
      refs.notes.click();
      break;
    case 'undo':
      game.undo();
      break;
    case 'redo':
      game.redo();
      break;
    case 'hint':
      refs.hint.click();
      break;
    case 'check':
      checkBoard();
      break;
    case 'symbols':
      refs.symbolsToggle.click();
      break;
    case 'deselect':
      disarm();
      break;
    case 'newGame':
      refs.newGame.click();
      break;
    case 'pause':
      refs.pause.click();
      break;
    case 'settings':
      sheet.open();
      break;
    case 'shortcuts':
      openShortcuts();
      break;
    default:
      break;
  }
}

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

document.body.append(shapeSprite());
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
