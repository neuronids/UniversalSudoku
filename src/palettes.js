/**
 * Colour palettes and colour maths.
 *
 * A palette is nine colours indexed 0..8, standing in for the digits 1..9.
 * Everything the board renders — fills, rings, ink for the optional symbols —
 * is derived from those nine hex values, so a custom palette needs no extra
 * configuration to look right.
 */

export const SWATCH_COUNT = 9;

/** @typedef {{id: string, name: string, description: string, colors: string[]}} Palette */

/** @type {Palette[]} */
export const PRESETS = [
  {
    id: 'default',
    name: 'Default',
    description: 'The spectrum, in order: yellow round to green.',
    colors: [
      '#f8e15a', // yellow
      '#f8a15a', // orange
      '#f85a5a', // red
      '#f85aa7', // pink
      '#9c5af8', // purple
      '#5a8af8', // blue
      '#5ae1f8', // cyan
      '#5af89f', // spring green
      '#84f85a', // green
    ],
  },
  {
    id: 'ten-plus-two',
    name: '10 + 2',
    description: 'Nine colours picked to stay apart from one another.',
    colors: [
      '#f3ebce', // cream
      '#fc7b9b', // pink
      '#00c9c2', // teal
      '#eb5c20', // orange
      '#51cf5f', // green
      '#ca8bcd', // lilac
      '#f4b907', // amber
      '#d5406a', // raspberry
      '#0088c8', // blue
    ],
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft, low-saturation tones.',
    colors: [
      '#e0858e', // blush
      '#e0c2a9', // sand
      '#e0de85', // butter
      '#8ae187', // mint
      '#9ad8c0', // seafoam
      '#87bde1', // sky
      '#858ce0', // periwinkle
      '#e085de', // orchid
      '#edc2eb', // petal
    ],
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    description: 'Saturated, high-energy colours.',
    colors: [
      '#e8352e', // red
      '#f97316', // orange
      '#facc15', // yellow
      '#22c55e', // green
      '#14b8a6', // teal
      '#2563eb', // blue
      '#7c3aed', // violet
      '#ec4899', // pink
      '#78350f', // brown
    ],
  },
  {
    id: 'cvd',
    name: 'Colour-blind safe',
    description: 'Okabe–Ito based. Stays distinct without red/green vision.',
    colors: [
      '#e69f00', // orange
      '#56b4e9', // sky blue
      '#009e73', // bluish green
      '#f0e442', // yellow
      '#0072b2', // blue
      '#d55e00', // vermillion
      '#cc79a7', // reddish purple
      '#bfbfbf', // light grey
      '#2b2b2b', // near black
    ],
  },
  {
    id: 'tritan',
    name: 'Blue-blind safe',
    description: 'For tritanopia: avoids blue/yellow confusions.',
    colors: [
      '#ffd9e8', // pale pink
      '#f17cb0', // pink
      '#b5122e', // crimson
      '#7b1e7a', // purple
      '#c8b3f2', // lavender
      '#6bd3d9', // cyan
      '#0f7c86', // teal
      '#8c6a4e', // taupe
      '#262626', // near black
    ],
  },
  {
    id: 'grayscale',
    name: 'Grey scale',
    description: 'Nine even steps of lightness. Symbols recommended.',
    colors: [
      '#ffffff',
      '#e4e4e4',
      '#c9c9c9',
      '#aeaeae',
      '#939393',
      '#787878',
      '#5d5d5d',
      '#3f3f3f',
      '#1c1c1c',
    ],
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Bright colours built for the dark theme.',
    colors: [
      '#ff5d8f',
      '#ff8a3d',
      '#ffe347',
      '#5dff9e',
      '#3df0e0',
      '#4da3ff',
      '#a66bff',
      '#ff6be1',
      '#9ea7b3',
    ],
  },
];

export const DEFAULT_PALETTE_ID = 'default';

/**
 * Optional glyphs drawn on top of each colour, for extra redundancy.
 *
 * The nine post-it shapes are not here: they are a way of drawing the cell
 * itself (see `shapes.js` and the `cellStyle` setting), not a glyph stamped on
 * a filled square.
 */
export const SYMBOL_SETS = {
  none: { label: 'None', glyphs: null },
  numbers: { label: 'Numbers', glyphs: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
  letters: { label: 'Letters', glyphs: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] },
};

export const getPreset = (id) => PRESETS.find((p) => p.id === id) || null;

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isValidHex = (value) => typeof value === 'string' && HEX_RE.test(value.trim());

/** Normalise any accepted hex form to lowercase `#rrggbb`. */
export function normalizeHex(value, fallback = '#cccccc') {
  if (!isValidHex(value)) return fallback;
  let hex = value.trim().slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return '#' + hex.toLowerCase();
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white — whichever reads better on `hex`. */
export function readableInk(hex) {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
}

/** Mix two colours; `amount` 0 returns `a`, 1 returns `b`. */
export function mix(a, b, amount) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * amount,
    g: ca.g + (cb.g - ca.g) * amount,
    b: ca.b + (cb.b - ca.b) * amount,
  });
}

/**
 * A ring colour that keeps a swatch visible against any board background, and
 * keeps a white swatch from reading as an empty cell.
 *
 * Mid-luminance colours have room in both directions but not much either way,
 * so rather than pick by a lightness threshold, try both and keep the one that
 * separates further.
 */
export function ringFor(hex) {
  const darker = mix(hex, '#000000', 0.34);
  const lighter = mix(hex, '#ffffff', 0.42);
  return contrastRatio(hex, darker) >= contrastRatio(hex, lighter) ? darker : lighter;
}

/** Coerce anything into a usable nine-colour list. */
export function sanitizeColors(colors, fallback = PRESETS[0].colors) {
  const out = [];
  for (let i = 0; i < SWATCH_COUNT; i++) {
    const candidate = Array.isArray(colors) ? colors[i] : null;
    out.push(isValidHex(candidate) ? normalizeHex(candidate) : fallback[i]);
  }
  return out;
}

/** CIE L*a*b* coordinates, for perceptual comparisons. */
export function hexToLab(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  // sRGB -> XYZ (D65), normalised against the reference white.
  let x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

/** Perceptual distance (CIE76). Roughly: below ~15 is hard to tell apart. */
export function deltaE(a, b) {
  const p = hexToLab(a);
  const q = hexToLab(b);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

/** Below this, two swatches are reported as hard to tell apart. */
export const CLOSE_THRESHOLD = 18;

/**
 * Report colour pairs that may be hard to tell apart, so the settings panel can
 * warn about a custom palette before someone plays a whole game with it.
 *
 * @returns {{a: number, b: number, distance: number}[]} pairs, closest first
 */
export function findCloseColors(colors, threshold = CLOSE_THRESHOLD) {
  const pairs = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const distance = deltaE(colors[i], colors[j]);
      if (distance < threshold) pairs.push({ a: i, b: j, distance });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}
