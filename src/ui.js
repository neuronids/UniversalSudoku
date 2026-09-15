/**
 * Board and control rendering.
 *
 * The 81 cells and 9 swatches are built once, then updated in place, so a
 * repaint never disturbs focus or the caret in the settings sheet.
 *
 * A value is drawn one of two ways, chosen by the `cellStyle` setting: as a
 * colour flooding the cell, or as one of the nine post-it shapes. Both are
 * present in the DOM for every cell and the stylesheet shows one of them, so
 * switching between them is an attribute flip rather than a rebuild.
 */

import { CELLS, SIZE, colOf, rowOf } from './sudoku.js';
import { notesToValues } from './game.js';
import { shapeFor } from './shapes.js';
import { keyLabel } from './keymap.js';
import { glyphFor, valueLabel } from './theme.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

/** An `<svg><use href="#shape-n"></svg>`, with the shape swapped in place later. */
function shapeSvg(className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  svg.append(use);
  return { svg, use };
}

function setShape(use, value) {
  if (value) use.setAttribute('href', `#shape-${value}`);
  else use.removeAttribute('href');
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export class BoardView {
  /**
   * @param {HTMLElement} root the `.board` grid
   * @param {{onSelect: (index: number) => void, onActivate: (index: number) => void}} handlers
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.cells = [];
    this.#build();
  }

  #build() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < CELLS; i++) {
      const cell = el('button', 'cell', { type: 'button' });
      cell.dataset.index = String(i);
      cell.setAttribute('role', 'gridcell');
      // Cells are reachable as one tab stop; arrow keys move between them.
      cell.tabIndex = i === 0 ? 0 : -1;

      cell.append(el('span', 'cell__fill'));

      const { svg: shape, use: shapeUse } = shapeSvg('cell__shape');
      cell.append(shape);

      const glyph = el('span', 'cell__glyph');
      cell.append(glyph);

      const notes = el('span', 'cell__notes');
      const noteUses = [];
      for (let v = 1; v <= SIZE; v++) {
        const pip = document.createElement('i');
        pip.dataset.v = String(v);
        const { svg, use } = shapeSvg('cell__note-shape');
        setShape(use, v);
        pip.append(svg);
        noteUses.push(use);
        notes.append(pip);
      }
      cell.append(notes);

      cell.addEventListener('click', () => this.handlers.onActivate(i));
      // Keep selection and focus together, so tabbing or scripted focus moves
      // the highlight too.
      cell.addEventListener('focus', () => this.handlers.onSelect(i));
      fragment.append(cell);
      this.cells.push({ cell, glyph, shapeUse, notes: [...notes.children], noteUses });
    }
    this.root.append(fragment);
  }

  /**
   * Repaint every cell from the current game state.
   *
   * @param {import('./game.js').Game} game
   * @param {object} settings
   * @param {{armed: number|null}} [view] the colour armed on the palette, which
   *        highlights its matches even when no cell is selected
   */
  render(game, settings, { armed = null } = {}) {
    const { selected } = game;
    const selectedValue = selected === null ? 0 : game.grid[selected];
    // A selected cell that holds a colour wins: it is the more recent, more
    // specific pointer. Otherwise the armed colour drives the highlight, which
    // is what makes "press 4 to see every 4" work with nothing selected.
    const highlightValue = selectedValue || armed || 0;
    const conflicts = settings.showMistakes ? game.conflicts() : new Set();
    // "Tell me when it's wrong" checks against the solution, so it catches a
    // colour that is wrong without repeating in any row, column or box.
    const wrong = settings.tellMeWrong ? game.wrongCells() : new Set();
    const shapeMode = settings.cellStyle === 'shape';

    // The row and column wash takes the selected cell's own colour, so the
    // crosshair reads as "this colour, here" rather than a neutral shade.
    if (selectedValue) this.root.dataset.peer = String(selectedValue);
    else delete this.root.dataset.peer;

    for (let i = 0; i < CELLS; i++) {
      const { cell, glyph, shapeUse, notes, noteUses } = this.cells[i];
      const value = game.grid[i];

      if (value) cell.dataset.value = String(value);
      else delete cell.dataset.value;

      cell.classList.toggle('is-given', game.isGiven(i));
      cell.classList.toggle('is-selected', i === selected);
      cell.classList.toggle('is-conflict', conflicts.has(i) || wrong.has(i));
      cell.classList.toggle(
        'is-peer',
        Boolean(settings.highlightPeers && selected !== null && i !== selected && sharesLine(i, selected))
      );
      cell.classList.toggle(
        'is-same',
        Boolean(settings.highlightSame && highlightValue && value === highlightValue && i !== selected)
      );

      setShape(shapeUse, shapeMode ? value : 0);
      // In shape mode the shape is already the second cue, so a letter or a
      // number on top of it would be one cue too many in the same 40 pixels.
      glyph.textContent = value && !shapeMode ? glyphFor(settings, value) : '';

      const marks = value ? [] : notesToValues(game.notes[i]);
      for (let v = 1; v <= SIZE; v++) {
        const pip = notes[v - 1];
        if (marks.includes(v)) pip.dataset.on = '';
        else delete pip.dataset.on;
        setShape(noteUses[v - 1], v);
      }

      // Givens stay clickable — selecting one highlights every matching colour —
      // so they are described as given rather than marked disabled.
      cell.setAttribute('aria-label', describeCell(i, value, marks, game.isGiven(i), settings));
      cell.tabIndex = i === (selected ?? 0) ? 0 : -1;
    }
  }

  /** Move keyboard focus to a cell without scrolling the page around. */
  focus(index) {
    const entry = this.cells[index];
    if (entry) entry.cell.focus({ preventScroll: true });
  }

  /** Briefly animate a cell, used when a hint lands. */
  flash(index) {
    const entry = this.cells[index];
    if (!entry) return;
    entry.cell.classList.remove('is-hint');
    void entry.cell.offsetWidth; // restart the animation
    entry.cell.classList.add('is-hint');
    setTimeout(() => entry.cell.classList.remove('is-hint'), 600);
  }
}

/** Same row or same column — the box is deliberately left out of the wash. */
const sharesLine = (a, b) => rowOf(a) === rowOf(b) || colOf(a) === colOf(b);

function describeCell(index, value, marks, given, settings) {
  const where = `row ${rowOf(index) + 1}, column ${colOf(index) + 1}`;
  if (value) return `${where}, ${valueLabel(value, settings)}${given ? ', given' : ''}`;
  if (marks.length) return `${where}, empty, notes ${marks.map((v) => valueLabel(v, settings)).join(', ')}`;
  return `${where}, empty`;
}

export class PaletteView {
  /**
   * @param {HTMLElement} root the `.palette` toolbar
   * @param {(value: number) => void} onPick
   */
  constructor(root, onPick) {
    this.root = root;
    this.buttons = [];
    this.shapeUses = [];
    for (let v = 1; v <= SIZE; v++) {
      const button = el('button', 'swatch', { type: 'button' });
      button.dataset.value = String(v);
      button.setAttribute('aria-pressed', 'false');
      const { svg, use } = shapeSvg('swatch__shape');
      setShape(use, v);
      button.append(svg);
      this.shapeUses.push(use);
      button.append(el('span', 'swatch__glyph'));
      button.append(el('span', 'swatch__count'));
      button.addEventListener('click', () => onPick(v));
      root.append(button);
      this.buttons.push(button);
    }
  }

  /**
   * @param {object} options
   * @param {number|null} options.active currently armed colour
   * @param {number[]} options.remaining how many of each value are unplaced
   * @param {object} options.settings
   */
  render({ active, remaining, settings }) {
    const shapeMode = settings.cellStyle === 'shape';
    this.buttons.forEach((button, i) => {
      const value = i + 1;
      const left = remaining[value] ?? 0;
      const symbol = shapeMode ? '' : glyphFor(settings, value);
      button.querySelector('.swatch__glyph').textContent = symbol;
      const count = button.querySelector('.swatch__count');
      count.textContent = settings.showRemaining && left > 0 ? String(left) : '';
      button.classList.toggle('is-done', left <= 0);
      button.setAttribute('aria-pressed', active === value ? 'true' : 'false');
      button.setAttribute(
        'aria-label',
        `${valueLabel(value, settings)}${settings.showRemaining ? `, ${left} left` : ''}`
      );
      const bound = settings.keymap?.[`place${value}`];
      button.title = bound
        ? `${valueLabel(value, settings)} — key ${keyLabel(bound)}`
        : valueLabel(value, settings);
    });
  }
}
