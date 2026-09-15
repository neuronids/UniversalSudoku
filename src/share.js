/**
 * Shareable puzzle links.
 *
 * The generator is deterministic — `generatePuzzle(difficulty, seed)` always
 * builds the same board — so a puzzle travels as nothing more than its
 * difficulty and seed. No server, no stored state, no expiry.
 *
 * Pure and DOM-free so the parsing edge cases can be tested directly.
 */

import { DIFFICULTIES } from './sudoku.js';

const HASH_PREFIX = 'puzzle=';
const MAX_SEED = 2 ** 32;

/** The hash fragment for a puzzle, including the leading `#`. */
export function formatPuzzleHash({ difficulty, seed }) {
  return `#${HASH_PREFIX}${difficulty}-${seed}`;
}

/**
 * A full shareable URL: `href` with its hash replaced by the puzzle spec.
 * Any existing hash is discarded rather than appended to.
 */
export function formatPuzzleLink(href, puzzle) {
  const url = new URL(href);
  url.hash = `${HASH_PREFIX}${puzzle.difficulty}-${puzzle.seed}`;
  return url.toString();
}

/**
 * Read a puzzle spec out of a URL hash.
 *
 * Anything unrecognised returns null so a stray or hand-edited fragment starts
 * an ordinary game instead of failing.
 *
 * @param {string} hash e.g. `#puzzle=medium-1234567`
 * @returns {{difficulty: string, seed: number}|null}
 */
export function parsePuzzleHash(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(HASH_PREFIX)) return null;

  const spec = raw.slice(HASH_PREFIX.length);
  // Split on the last dash: difficulty names carry no dashes, but splitting
  // from the right keeps this working if one ever does.
  const dash = spec.lastIndexOf('-');
  if (dash <= 0) return null;

  const difficulty = spec.slice(0, dash);
  const seedText = spec.slice(dash + 1);
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, difficulty)) return null;
  if (!/^\d+$/.test(seedText)) return null;

  const seed = Number(seedText);
  if (!Number.isSafeInteger(seed) || seed >= MAX_SEED) return null;
  return { difficulty, seed };
}

/** True when a saved game is the same puzzle a link points at. */
export function matchesPuzzle(snapshot, puzzle) {
  return Boolean(snapshot && puzzle && snapshot.seed === puzzle.seed && snapshot.difficulty === puzzle.difficulty);
}
