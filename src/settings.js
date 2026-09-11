/**
 * The colours & settings sheet: palette presets, the nine-colour editor,
 * symbol and theme choices, assists and saved times.
 */

import {
  CLOSE_THRESHOLD,
  SWATCH_COUNT,
  SYMBOL_SETS,
  findCloseColors,
  isValidHex,
  normalizeHex,
  readableInk,
} from './palettes.js';
import { ACTIONS, DEFAULT_KEYMAP, bindKey, groupedActions, isBindableKey, keyLabel } from './keymap.js';
import { DIFFICULTIES } from './sudoku.js';
import { loadCustomPalettes, loadStats, saveCustomPalettes } from './storage.js';
import { allPalettes, resolveColors } from './theme.js';
import { formatTime } from './ui.js';

const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

const CELL_STYLES = [
  ['fill', 'Colour'],
  ['shape', 'Shapes'],
];

const COLOUR_SWITCHES = [
  {
    key: 'monochrome',
    title: 'Turn colour off',
    desc: 'Draws every value as a shape in one ink. Turns shapes on, since colour is then the only other cue.',
  },
];

const ASSISTS = [
  { key: 'highlightPeers', title: 'Highlight the row, column and box', desc: 'Shades everything the selected cell can see.' },
  { key: 'highlightSame', title: 'Highlight the same colour', desc: 'Outlines every cell holding the colour you picked or selected.' },
  { key: 'showMistakes', title: 'Flag clashes', desc: 'Marks a colour that repeats in a row, column or box.' },
  {
    key: 'tellMeWrong',
    title: "Tell me when it's wrong",
    desc: 'Marks anything that disagrees with the solution, even when it clashes with nothing.',
  },
  { key: 'showRemaining', title: 'Count what is left', desc: 'Shows how many of each colour are still unplaced.' },
  { key: 'autoRemoveNotes', title: 'Tidy pencil marks', desc: 'Clears notes a placement has just ruled out.' },
  { key: 'timer', title: 'Show the timer', desc: 'Times are still recorded when this is off.' },
  { key: 'showShortcutBar', title: 'Show the shortcut bar', desc: 'Prints the basic keys under the board.' },
];

const THEMES = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export class SettingsSheet {
  /**
   * @param {object} refs DOM nodes from index.html
   * @param {{getSettings: () => object, update: (patch: object) => void,
 *          toggleSymbols: (on?: boolean) => void, onReset: () => void}} api
   */
  constructor(refs, api) {
    this.refs = refs;
    this.api = api;
    this.hexInputs = [];
    /** Row armed for a colour swap, or null. */
    this.swapFrom = null;
    /** The action waiting for a key press, or null. */
    this.capturing = null;
    this.keyRows = new Map();
    this.#buildEditor();
    this.#buildSegmented(refs.cellStyle, CELL_STYLES, 'cellStyle');
    this.#buildSegmented(refs.symbols, Object.entries(SYMBOL_SETS).map(([id, s]) => [id, s.label]), 'symbols');
    this.#buildSegmented(refs.theme, THEMES, 'theme');
    this.#buildSwitches(refs.colourSwitches, COLOUR_SWITCHES);
    this.#buildSwitches(refs.switches, ASSISTS);
    this.#buildKeys();
    this.#bindButtons();
  }

  get settings() {
    return this.api.getSettings();
  }

  open() {
    this.swapFrom = null;
    this.#stopCapture();
    this.render();
    if (!this.refs.dialog.open) this.refs.dialog.showModal();
  }

  close() {
    if (this.refs.dialog.open) this.refs.dialog.close();
  }

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  #buildEditor() {
    for (let i = 0; i < SWATCH_COUNT; i++) {
      const number = i + 1;
      const row = el('div', 'editor__row');
      row.dataset.number = String(number);

      // The colour picker doubles as the preview, with the number written on it
      // so the mapping is legible even with symbols turned off on the board.
      const swatch = el('label', 'editor__swatch');
      const picker = el('input', '', { type: 'color' });
      picker.setAttribute('aria-label', `Colour for number ${number}`);
      picker.addEventListener('input', () => this.#setColor(i, picker.value));
      const stamp = el('span', 'editor__stamp', { textContent: String(number) });
      stamp.setAttribute('aria-hidden', 'true');
      swatch.append(picker, stamp);

      const meta = el('div', 'editor__meta');
      meta.append(el('span', 'editor__label', { textContent: `Number ${number}` }));

      const hex = el('input', 'editor__hex', { type: 'text', spellcheck: false, maxLength: 7 });
      hex.setAttribute('aria-label', `Colour for number ${number}, hex value`);
      hex.addEventListener('input', () => {
        const value = hex.value.trim();
        const ok = isValidHex(value);
        hex.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (ok) this.#setColor(i, normalizeHex(value), { skipHex: i });
      });
      hex.addEventListener('blur', () => this.render());
      meta.append(hex);

      const swap = el('button', 'editor__swap', { type: 'button', textContent: '⇄' });
      swap.setAttribute('aria-pressed', 'false');
      swap.addEventListener('click', () => this.#swap(i));
      row.append(swatch, meta, swap);

      this.refs.editor.append(row);
      this.hexInputs.push({ picker, hex, stamp, swap, row });
    }
  }

  /**
   * Trade two numbers' colours. The first click arms a row, the second one
   * completes the trade; clicking the armed row again calls it off.
   */
  #swap(index) {
    if (this.swapFrom === null || this.swapFrom === undefined) {
      this.swapFrom = index;
      this.#renderEditor();
      return;
    }
    const from = this.swapFrom;
    this.swapFrom = null;
    if (from === index) {
      this.#renderEditor();
      return;
    }
    const colors = resolveColors(this.settings);
    [colors[from], colors[index]] = [colors[index], colors[from]];
    this.api.update({ overrides: Object.fromEntries(colors.map((hex, i) => [i, hex])) });
    this.render();
  }

  #buildSegmented(root, entries, key) {
    for (const [value, label] of entries) {
      const button = el('button', '', { type: 'button', textContent: label });
      button.setAttribute('role', 'radio');
      button.dataset.value = value;
      button.addEventListener('click', () => this.api.update({ [key]: value }));
      root.append(button);
    }
  }

  #buildSwitches(root, entries) {
    for (const { key, title, desc } of entries) {
      const label = el('label', 'switch');
      const input = el('input', '', { type: 'checkbox' });
      input.addEventListener('change', () => this.api.update({ [key]: input.checked }));

      const text = el('span', 'switch__text');
      text.append(el('span', 'switch__title', { textContent: title }));
      text.append(el('span', 'switch__desc', { textContent: desc }));

      label.append(text, input, el('span', 'switch__track'));
      root.append(label);
      label.dataset.key = key;
    }
  }

  /**
   * One row per action, each with a button that arms key capture.
   *
   * Capture listens on the dialog in the capture phase so the key never reaches
   * the game's own handler — otherwise binding `p` would pause the game on the
   * way to being bound.
   */
  #buildKeys() {
    for (const { title, bindings } of groupedActions()) {
      const group = el('div', 'keys__group');
      group.append(el('h4', 'keys__title', { textContent: title }));

      for (const { action, label } of bindings) {
        const row = el('div', 'keys__row');
        row.append(el('span', 'keys__label', { textContent: label }));

        const button = el('button', 'keys__button', { type: 'button' });
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => this.#startCapture(action));
        row.append(button);

        group.append(row);
        this.keyRows.set(action, button);
      }
      this.refs.keys.append(group);
    }

    this.refs.dialog.addEventListener(
      'keydown',
      (event) => {
        if (this.capturing === null) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.#stopCapture();
          return;
        }
        if (!isBindableKey(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const action = this.capturing;
        this.capturing = null;
        this.api.update({ keymap: bindKey(this.settings.keymap, action, event.key) });
        this.#renderKeys();
      },
      true
    );

    // Clicking elsewhere, or closing the sheet, gives up on the capture.
    this.refs.dialog.addEventListener('click', (event) => {
      if (this.capturing !== null && !(event.target instanceof HTMLElement && event.target.closest('.keys__button'))) {
        this.#stopCapture();
      }
    });
    this.refs.dialog.addEventListener('close', () => this.#stopCapture());
  }

  #startCapture(action) {
    this.capturing = this.capturing === action ? null : action;
    this.#renderKeys();
  }

  #stopCapture() {
    if (this.capturing === null) return;
    this.capturing = null;
    this.#renderKeys();
  }

  #renderKeys() {
    const { keymap } = this.settings;
    for (const { action, label } of ACTIONS) {
      const button = this.keyRows.get(action);
      if (!button) continue;
      const capturing = this.capturing === action;
      const key = keymap[action];
      button.textContent = capturing ? 'Press a key…' : key ? keyLabel(key) : 'Not set';
      button.dataset.unset = !capturing && !key ? 'true' : 'false';
      button.setAttribute('aria-pressed', capturing ? 'true' : 'false');
      button.setAttribute(
        'aria-label',
        capturing ? `Press a key for ${label}` : `${label}: ${key ? keyLabel(key) : 'not set'}. Change it.`
      );
    }
  }

  #bindButtons() {
    this.refs.resetKeys.addEventListener('click', () => {
      this.#stopCapture();
      this.api.update({ keymap: { ...DEFAULT_KEYMAP } });
      this.#renderKeys();
    });

    this.refs.resetColors.addEventListener('click', () => {
      this.api.update({ overrides: {} });
      this.render();
    });

    this.refs.shuffleColors.addEventListener('click', () => {
      const colors = resolveColors(this.settings);
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
      }
      this.api.update({ overrides: Object.fromEntries(colors.map((hex, i) => [i, hex])) });
      this.render();
    });

    this.refs.savePalette.addEventListener('click', () => this.#savePalette());

    this.refs.resetData.addEventListener('click', () => {
      if (confirm('Erase saved settings, palettes, times and the game in progress?')) this.api.onReset();
    });
  }

  #savePalette() {
    const name = (prompt('Name for this palette', 'My colours') || '').trim();
    if (!name) return;
    const palettes = loadCustomPalettes();
    const id = `custom-${Date.now().toString(36)}`;
    palettes.push({ id, name: name.slice(0, 40), colors: resolveColors(this.settings) });
    saveCustomPalettes(palettes);
    // Switch to the saved palette so the overrides are now the palette itself.
    this.api.update({ paletteId: id, overrides: {} });
    this.render();
  }

  #setColor(index, hex, { skipHex = -1 } = {}) {
    const overrides = { ...this.settings.overrides, [index]: normalizeHex(hex) };
    this.api.update({ overrides });
    this.#renderEditor(skipHex);
    this.#renderNotice();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render() {
    this.#renderPresets();
    this.#renderEditor();
    this.#renderNotice();
    this.#renderChoices();
    this.#renderKeys();
    this.#renderStats();
  }

  #renderPresets() {
    const settings = this.settings;
    const root = this.refs.presets;
    root.textContent = '';

    for (const palette of allPalettes()) {
      const card = el('button', 'preset', { type: 'button' });
      card.setAttribute('aria-pressed', palette.id === settings.paletteId ? 'true' : 'false');

      const strip = el('span', 'preset__strip');
      for (const hex of palette.colors) {
        const chip = document.createElement('i');
        chip.style.background = hex;
        strip.append(chip);
      }

      card.append(strip);
      card.append(el('span', 'preset__name', { textContent: palette.name }));
      card.append(el('span', 'preset__desc', { textContent: palette.description }));
      card.addEventListener('click', () => {
        this.api.update({ paletteId: palette.id, overrides: {} });
        this.render();
      });
      root.append(card);

      if (palette.custom) {
        const remove = el('button', 'preset__delete', { type: 'button', textContent: 'Delete' });
        remove.addEventListener('click', (event) => {
          event.stopPropagation();
          const kept = loadCustomPalettes().filter((p) => p.id !== palette.id);
          saveCustomPalettes(kept);
          if (settings.paletteId === palette.id) this.api.update({ paletteId: 'pastel', overrides: {} });
          this.render();
        });
        card.append(remove);
      }
    }
  }

  #renderEditor(skipHex = -1) {
    const colors = resolveColors(this.settings);
    const arming = this.swapFrom ?? null;

    this.hexInputs.forEach(({ picker, hex, stamp, swap, row }, i) => {
      picker.value = colors[i];
      if (i !== skipHex) {
        hex.value = colors[i];
        hex.setAttribute('aria-invalid', 'false');
      }
      // The number sits on the swatch, so it needs the same readable ink the
      // board uses for that colour.
      stamp.style.color = readableInk(colors[i]);

      const armed = arming === i;
      row.classList.toggle('is-swapping', armed);
      row.classList.toggle('is-swap-target', arming !== null && !armed);
      swap.setAttribute('aria-pressed', armed ? 'true' : 'false');
      swap.setAttribute(
        'aria-label',
        armed
          ? `Cancel swapping number ${i + 1}`
          : arming !== null
            ? `Swap number ${arming + 1} with number ${i + 1}`
            : `Swap number ${i + 1} with another number`
      );
      swap.title = swap.getAttribute('aria-label');
    });
  }

  #renderNotice() {
    const notice = this.refs.notice;
    const colors = resolveColors(this.settings);
    const close = findCloseColors(colors);
    if (!close.length || this.settings.symbols !== 'none') {
      notice.hidden = true;
      notice.textContent = '';
      return;
    }

    const pairs = close.slice(0, 3).map(({ a, b }) => `${a + 1} and ${b + 1}`).join(', ');
    notice.textContent = `Some colours sit close together (${pairs}). Symbols make them easy to tell apart. `;
    const fix = el('button', 'linkish', { type: 'button', textContent: 'Turn on symbols' });
    fix.addEventListener('click', () => {
      this.api.toggleSymbols(true);
      this.render();
    });
    notice.append(fix);
    notice.hidden = false;
  }

  #renderChoices() {
    const settings = this.settings;
    for (const [root, key] of [
      [this.refs.cellStyle, 'cellStyle'],
      [this.refs.symbols, 'symbols'],
      [this.refs.theme, 'theme'],
    ]) {
      for (const button of root.children) {
        button.setAttribute('aria-checked', button.dataset.value === settings[key] ? 'true' : 'false');
      }
    }
    for (const root of [this.refs.colourSwitches, this.refs.switches]) {
      for (const label of root.children) {
        label.querySelector('input').checked = Boolean(settings[label.dataset.key]);
      }
    }
  }

  #renderStats() {
    const stats = loadStats();
    const root = this.refs.stats;
    root.textContent = '';
    let any = false;

    for (const [key, spec] of Object.entries(DIFFICULTIES)) {
      const entry = stats[key];
      const card = el('div', 'stat');
      card.append(el('span', 'stat__label', { textContent: spec.label }));
      card.append(el('div', 'stat__value', { textContent: entry?.best != null ? formatTime(entry.best) : '—' }));
      card.append(
        el('div', 'stat__sub', {
          textContent: entry?.played ? `${entry.played} solved` : 'not solved yet',
        })
      );
      if (entry?.played) any = true;
      root.append(card);
    }

    if (!any) {
      root.textContent = '';
      root.append(el('p', 'panel__hint', { textContent: 'Solve a board and your best times show up here.' }));
    }
  }
}

export { CLOSE_THRESHOLD, readableInk };
