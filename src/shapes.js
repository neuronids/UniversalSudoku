/**
 * The nine post-it shapes.
 *
 * Each value 1..9 has a shape as well as a colour, so the board can be played
 * by shape alone — with colour turned down to a single ink, or off entirely.
 * Paths are drawn in a 100×100 box and rendered as one SVG per cell; `fill`
 * shapes take the value's colour as their fill, `stroke` shapes as their
 * stroke, so both read at the same visual weight.
 */

export const SHAPES = [
  { id: 'circle', name: 'Circle', kind: 'fill', d: 'M50 8a42 42 0 1 0 0 84 42 42 0 0 0 0-84Z' },
  { id: 'square', name: 'Square', kind: 'fill', d: 'M14 14h72v72H14Z' },
  { id: 'triangle', name: 'Triangle', kind: 'fill', d: 'M50 10 92 86H8Z' },
  { id: 'plus', name: 'Plus', kind: 'fill', d: 'M38 8h24v30h30v24H62v30H38V62H8V38h30Z' },
  { id: 'minus', name: 'Minus', kind: 'fill', d: 'M8 38h84v24H8Z' },
  { id: 'wave', name: 'Wave', kind: 'stroke', d: 'M8 58c10.5-30 21-30 31.5 0S60.5 88 71 58s21-30 21-30' },
  {
    id: 'star',
    name: 'Star',
    kind: 'fill',
    d: 'M50 6 62.4 36.3 95 39.2 70.3 60.7 77.8 92.6 50 75.6 22.2 92.6l7.5-31.9L5 39.2l32.6-2.9Z',
  },
  { id: 'chevron', name: 'Chevron', kind: 'stroke', d: 'M12 70 50 26l38 44' },
  { id: 'smile', name: 'Smile', kind: 'stroke', d: 'M12 38a38 38 0 0 0 76 0' },
];

/** The shape for a value 1..9. */
export const shapeFor = (value) => SHAPES[value - 1] ?? SHAPES[0];

/** Build the `<defs>` sprite every cell and swatch references by id. */
export function shapeSprite() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('shape-sprite');

  SHAPES.forEach((shape, i) => {
    const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    symbol.id = `shape-${i + 1}`;
    symbol.setAttribute('viewBox', '0 0 100 100');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', shape.d);
    if (shape.kind === 'stroke') {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '16');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    } else {
      path.setAttribute('fill', 'currentColor');
    }
    symbol.append(path);
    svg.append(symbol);
  });

  return svg;
}
