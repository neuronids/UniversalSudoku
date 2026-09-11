/**
 * Keyboard bindings.
 *
 * Every action has a default key and can be rebound from the settings sheet.
 * The map is `{action: key}`, where a key is exactly what `KeyboardEvent.key`
 * reports — single characters are stored lowercase so `T` and `t` both match.
 * The digits 1–9 always place a colour and are deliberately not rebindable:
 * they are the game's alphabet, not a shortcut.
 */

/** @typedef {{action: string, label: string, group: string, default: string}} Binding */

/** @type {Binding[]} */
export const ACTIONS = [
  { action: 'moveUp', label: 'Move up', group: 'Moving around', default: 'ArrowUp' },
  { action: 'moveDown', label: 'Move down', group: 'Moving around', default: 'ArrowDown' },
  { action: 'moveLeft', label: 'Move left', group: 'Moving around', default: 'ArrowLeft' },
  { action: 'moveRight', label: 'Move right', group: 'Moving around', default: 'ArrowRight' },
  { action: 'rowStart', label: 'Start of the row', group: 'Moving around', default: 'Home' },
  { action: 'rowEnd', label: 'End of the row', group: 'Moving around', default: 'End' },
  { action: 'colStart', label: 'Top of the column', group: 'Moving around', default: 'PageUp' },
  { action: 'colEnd', label: 'Bottom of the column', group: 'Moving around', default: 'PageDown' },
  { action: 'prevEmpty', label: 'Previous empty cell', group: 'Moving around', default: '[' },
  { action: 'nextEmpty', label: 'Next empty cell', group: 'Moving around', default: ']' },

  { action: 'erase', label: 'Clear the cell', group: 'Playing', default: 'Backspace' },
  { action: 'notes', label: 'Pencil marks on or off', group: 'Playing', default: 'n' },
  { action: 'undo', label: 'Undo', group: 'Playing', default: 'z' },
  { action: 'redo', label: 'Redo', group: 'Playing', default: 'y' },
  { action: 'hint', label: 'Reveal one colour', group: 'Playing', default: 'h' },
  { action: 'check', label: 'Check the board', group: 'Playing', default: 'c' },
  { action: 'symbols', label: 'Symbols on or off', group: 'Playing', default: 't' },
  { action: 'deselect', label: 'Put the current colour down', group: 'Playing', default: 'Escape' },

  { action: 'newGame', label: 'New game', group: 'Everything else', default: 'g' },
  { action: 'pause', label: 'Pause', group: 'Everything else', default: 'p' },
  { action: 'settings', label: 'Settings', group: 'Everything else', default: 's' },
  { action: 'shortcuts', label: 'The shortcut list', group: 'Everything else', default: '?' },
];

export const ACTION_LABELS = Object.fromEntries(ACTIONS.map((a) => [a.action, a.label]));

/** The groups in the order they are shown, each with its actions. */
export function groupedActions() {
  const groups = [];
  for (const binding of ACTIONS) {
    let group = groups.find((g) => g.title === binding.group);
    if (!group) groups.push((group = { title: binding.group, bindings: [] }));
    group.bindings.push(binding);
  }
  return groups;
}

export const DEFAULT_KEYMAP = Object.fromEntries(ACTIONS.map((a) => [a.action, a.default]));

/** Keys that must keep doing their own job, so they cannot be bound. */
const RESERVED = new Set(['Tab', 'Enter', ' ', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead']);

/** Digits place colours; binding one would shadow the game's own alphabet. */
const isDigit = (key) => key.length === 1 && key >= '0' && key <= '9';

/** Whether a key event can be captured as a binding. */
export function isBindableKey(key) {
  if (!key || RESERVED.has(key)) return false;
  if (isDigit(key)) return false;
  return true;
}

/** Store a key the way lookups will see it. */
export const canonicalKey = (key) => (key.length === 1 ? key.toLowerCase() : key);

/** Drop anything unusable, then fill the gaps from the defaults. */
export function sanitizeKeymap(value) {
  const map = { ...DEFAULT_KEYMAP };
  if (!value || typeof value !== 'object') return map;
  for (const { action } of ACTIONS) {
    const key = value[action];
    if (typeof key === 'string' && isBindableKey(key)) map[action] = canonicalKey(key);
  }
  return map;
}

/**
 * Which action a key press runs, or null.
 *
 * A key bound twice would be ambiguous, so rebinding clears the other holder —
 * see `bindKey` — and this can safely take the first match.
 */
export function actionForKey(keymap, key) {
  const wanted = canonicalKey(key);
  for (const { action } of ACTIONS) {
    if (keymap[action] === wanted) return action;
  }
  return null;
}

/**
 * Bind `key` to `action`, releasing it from whatever held it before.
 *
 * The displaced action is left unbound rather than given a replacement: a
 * silent reshuffle of a binding nobody asked about is worse than an empty row
 * the settings sheet can show as "not set".
 */
export function bindKey(keymap, action, key) {
  if (!isBindableKey(key)) return keymap;
  const wanted = canonicalKey(key);
  const next = { ...keymap };
  for (const other of Object.keys(next)) {
    if (other !== action && next[other] === wanted) next[other] = '';
  }
  next[action] = wanted;
  return next;
}

const KEY_LABELS = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ' ': 'Space',
};

/** How a key is written on a `<kbd>`. */
export function keyLabel(key) {
  if (!key) return '—';
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key.length === 1 ? key.toUpperCase() : key;
}
