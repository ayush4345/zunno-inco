/**
 * Plain-JS port of contracts/src/UnoCards.sol's decode/isPlayable logic, so
 * the bot can decide legal moves without a Solidity call. Keep in sync with
 * that file if the card codec ever changes.
 */
const COLOR_WILD = 4;
const NUMBER = 0;
const SKIP = 1;
const REVERSE = 2;
const DRAW_TWO = 3;
const WILD = 4;
const WILD_DRAW_FOUR = 5;

function decodeCard(value) {
  const v = Number(value);
  const id = v - 1;
  if (id >= 100) {
    return { color: COLOR_WILD, kind: id < 104 ? WILD : WILD_DRAW_FOUR, number: -1 };
  }
  const color = Math.floor(id / 25);
  const w = id % 25;
  let kind;
  let number = -1;
  if (w === 0) {
    kind = NUMBER;
    number = 0;
  } else if (w <= 18) {
    kind = NUMBER;
    number = Math.floor((w + 1) / 2);
  } else if (w <= 20) {
    kind = SKIP;
  } else if (w <= 22) {
    kind = REVERSE;
  } else {
    kind = DRAW_TWO;
  }
  return { color, kind, number };
}

function isWild(value) {
  return Number(value) >= 101;
}

function isPlayable(played, topValue, activeColor) {
  const p = decodeCard(played);
  if (p.kind === WILD || p.kind === WILD_DRAW_FOUR) return true;
  if (p.color === Number(activeColor)) return true;
  const t = decodeCard(topValue);
  if (p.kind === NUMBER && t.kind === NUMBER && p.number === t.number) return true;
  if (p.kind !== NUMBER && p.kind === t.kind) return true;
  return false;
}

module.exports = { decodeCard, isWild, isPlayable, NUMBER, SKIP, REVERSE, DRAW_TWO, WILD, WILD_DRAW_FOUR };
