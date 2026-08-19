/**
 * Turns the settings object into the CSS custom properties the stylesheet
 * reads, and keeps the document theme in sync.
 */

import {
  PRESETS,
  SWATCH_COUNT,
  SYMBOL_SETS,
  getPreset,
  normalizeHex,
  readableInk,
  ringFor,
  sanitizeColors,
} from './palettes.js';
import { loadCustomPalettes } from './storage.js';

/** Every palette on offer: built-in presets first, then the player's own. */
export function allPalettes() {
  return [...PRESETS, ...loadCustomPalettes()];
}

export function findPalette(id) {
  return allPalettes().find((p) => p.id === id) || PRESETS[0];
}

/**
 * The nine colours actually in play: the chosen palette with any per-slot
 * overrides applied on top.
 */
export function resolveColors(settings) {
  const base = findPalette(settings.paletteId).colors;
  const colors = base.slice();
  for (const [index, hex] of Object.entries(settings.overrides || {})) {
    const i = Number(index);
    if (i >= 0 && i < SWATCH_COUNT) colors[i] = hex;
  }
  return sanitizeColors(colors, base);
}

/** Glyph shown on value `v` (1..9), or an empty string when symbols are off. */
export function glyphFor(settings, value) {
  const set = SYMBOL_SETS[settings.symbols] || SYMBOL_SETS.none;
  return set.glyphs ? set.glyphs[value - 1] : '';
}

/** Write --c/--r/--i for all nine values onto an element. */
export function applyColors(element, colors) {
  colors.forEach((raw, i) => {
    const hex = normalizeHex(raw);
    element.style.setProperty(`--c${i + 1}`, hex);
    element.style.setProperty(`--r${i + 1}`, ringFor(hex));
    element.style.setProperty(`--i${i + 1}`, readableInk(hex));
  });
}

/** Set the document theme; `system` follows the OS preference. */
export function applyTheme(theme) {
  const value = ['light', 'dark'].includes(theme) ? theme : 'system';
  document.documentElement.dataset.theme = value;
}

/**
 * How a value is named in labels and to screen readers.
 *
 * Always the number, never the colour: a colour name tells a screen-reader user
 * nothing, while "number 3" identifies the same thing unambiguously and does not
 * shift when the symbol set changes.
 */
export function valueLabel(value) {
  return `number ${value}`;
}

export { getPreset };
