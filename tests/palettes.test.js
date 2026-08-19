import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLOSE_THRESHOLD,
  PRESETS,
  SWATCH_COUNT,
  SYMBOL_SETS,
  contrastRatio,
  deltaE,
  findCloseColors,
  getPreset,
  isValidHex,
  luminance,
  mix,
  normalizeHex,
  readableInk,
  ringFor,
  sanitizeColors,
} from '../src/palettes.js';

test('every preset offers nine valid, distinct colours', () => {
  for (const preset of PRESETS) {
    assert.equal(preset.colors.length, SWATCH_COUNT, `${preset.id} needs nine colours`);
    assert.equal(new Set(preset.colors).size, SWATCH_COUNT, `${preset.id} repeats a colour`);
    for (const hex of preset.colors) assert.ok(isValidHex(hex), `${preset.id} has a bad hex: ${hex}`);
  }
});

test('preset ids are unique and pastel is present as the default', () => {
  const ids = PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(getPreset('pastel'));
  assert.equal(getPreset('nope'), null);
});

test('the colour palettes keep their swatches far enough apart', () => {
  // Grey scale is the deliberate exception: nine steps of one hue cannot be
  // widely separated, which is why that preset recommends symbols.
  for (const preset of PRESETS.filter((p) => p.id !== 'grayscale')) {
    assert.deepEqual(
      findCloseColors(preset.colors),
      [],
      `${preset.id} has swatches closer than ΔE ${CLOSE_THRESHOLD}`
    );
  }
  assert.ok(findCloseColors(getPreset('grayscale').colors).length > 0);
});

test('every swatch is distinguishable from a white and a dark board', () => {
  for (const preset of PRESETS) {
    for (const hex of preset.colors) {
      const apart = Math.max(deltaE(hex, '#ffffff'), deltaE(hex, '#232733'));
      assert.ok(apart > 20, `${preset.id} ${hex} blends into the board`);
    }
  }
});

test('symbol sets each provide nine glyphs, apart from "none"', () => {
  assert.equal(SYMBOL_SETS.none.glyphs, null);
  for (const [id, set] of Object.entries(SYMBOL_SETS)) {
    if (id === 'none') continue;
    assert.equal(set.glyphs.length, SWATCH_COUNT, `${id} needs nine glyphs`);
    assert.equal(new Set(set.glyphs).size, SWATCH_COUNT, `${id} repeats a glyph`);
  }
});

test('normalizeHex accepts shorthand and rejects rubbish', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('  #A1B2C3  '), '#a1b2c3');
  assert.equal(normalizeHex('red', '#123456'), '#123456');
  assert.equal(normalizeHex(null, '#123456'), '#123456');
  assert.equal(normalizeHex('#12345', '#123456'), '#123456');
  assert.ok(!isValidHex('#12345'));
  assert.ok(isValidHex('#abc'));
});

test('luminance and contrast follow the WCAG definitions', () => {
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#ffffff'), 1);
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#336699', '#336699'), 1);
});

test('readableInk picks the higher-contrast of black and white', () => {
  assert.equal(readableInk('#ffffff'), '#000000');
  assert.equal(readableInk('#000000'), '#ffffff');
  for (const preset of PRESETS) {
    for (const hex of preset.colors) {
      const ink = readableInk(hex);
      assert.ok(contrastRatio(hex, ink) >= 4.5, `${hex} on ${ink} is too low contrast`);
    }
  }
});

test('mix interpolates between two colours', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

test('ringFor stays visible against its own colour', () => {
  for (const preset of PRESETS) {
    for (const hex of preset.colors) {
      const ring = ringFor(hex);
      assert.ok(isValidHex(ring));
      assert.ok(contrastRatio(hex, ring) > 1.8, `${hex} ring is invisible`);
    }
  }
});

test('sanitizeColors repairs a partial or broken list', () => {
  const fallback = PRESETS[0].colors;
  assert.deepEqual(sanitizeColors(null), fallback);
  assert.deepEqual(sanitizeColors(['#fff']), ['#ffffff', ...fallback.slice(1)]);
  assert.deepEqual(sanitizeColors(['nope', '#000'])[0], fallback[0]);
  assert.equal(sanitizeColors([]).length, SWATCH_COUNT);
});

test('deltaE is zero for a colour against itself and grows with difference', () => {
  assert.equal(deltaE('#123456', '#123456'), 0);
  assert.ok(deltaE('#000000', '#ffffff') > deltaE('#000000', '#111111'));
});

test('findCloseColors reports the closest pair first', () => {
  const colors = ['#ff0000', '#ff0004', '#00ff00', '#0000ff', '#111111', '#222222', '#00ffff', '#ff00ff', '#ffff00'];
  const close = findCloseColors(colors);
  assert.ok(close.length >= 2);
  assert.deepEqual([close[0].a, close[0].b], [0, 1]);
  for (let i = 1; i < close.length; i++) assert.ok(close[i].distance >= close[i - 1].distance);
});
