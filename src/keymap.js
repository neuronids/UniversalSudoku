/**
 * Keyboard bindings.
 *
 * Every action has a default key and can be rebound from the settings sheet,
 * placing a colour included. The map is `{action: key}`, where a key is exactly
 * what `KeyboardEvent.key` reports — single characters are stored lowercase so
 * `T` and `t` both match.
 *
 * Only the keys a page cannot function without are held back: the modifiers,
 * and Enter and Space, which are how a focused button is pressed. Everything
 * else is fair game, `Tab` and the digits included — binding `Tab` does mean
 * giving up the way out of the board, which is why the settings sheet says so.
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

  ...Array.from({ length: 9 }, (_, i) => ({
    action: `place${i + 1}`,
    label: `Place colour ${i + 1}`,
    group: 'Placing a colour',
    default: String(i + 1),
  })),

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

/**
 * Keys that must keep doing their own job, so they cannot be bound: the
 * modifiers, which are never a press on their own, and Enter and Space, which
 * are how a focused button is pressed anywhere on the page.
 */
const RESERVED = new Set(['Enter', ' ', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead']);

/** Whether a key event can be captured as a binding. */
export function isBindableKey(key) {
  return Boolean(key) && !RESERVED.has(key);
}

/** The nine placing actions, in order. */
export const PLACE_ACTIONS = Array.from({ length: 9 }, (_, i) => `place${i + 1}`);

/** The value a placing action places, or null for anything else. */
export function placedValue(action) {
  const index = PLACE_ACTIONS.indexOf(action);
  return index === -1 ? null : index + 1;
}

/**
 * How the placing keys read as one line: `1 – 9` while they are still the nine
 * plain digits in order, and the actual keys once any of them has moved.
 */
export function placementLabels(keymap) {
  const keys = PLACE_ACTIONS.map((action) => keymap[action]);
  if (keys.every((key, i) => key === String(i + 1))) return ['1 – 9'];
  return keys.filter(Boolean).map(keyLabel);
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
