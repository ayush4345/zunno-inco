const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decodeCard, isWild, isPlayable } = require('./cards');

// id 0 -> value 1 = Red 0; id 25 -> value 26 = Yellow 0; id 100 -> value 101 = Wild
test('decodeCard matches the contract codec at the color/kind boundaries', () => {
  assert.deepEqual(decodeCard(1), { color: 0, kind: 0, number: 0 }); // Red 0
  assert.deepEqual(decodeCard(26), { color: 1, kind: 0, number: 0 }); // Yellow 0
  assert.equal(decodeCard(101).kind, 4); // Wild
  assert.equal(decodeCard(105).kind, 5); // Wild Draw Four
});

test('isWild matches values 101..108 only', () => {
  assert.equal(isWild(100), false);
  assert.equal(isWild(101), true);
  assert.equal(isWild(108), true);
});

test('isPlayable: wilds are always legal', () => {
  assert.equal(isPlayable(101, 1, 2), true); // top is Red 0, active color Green — wild still legal
});

test('isPlayable: color match is legal regardless of number', () => {
  // Red 0 (value 1) on top of Red 5 (value ~11), active color Red (0)
  assert.equal(isPlayable(1, 11, 0), true);
});

test('isPlayable: neither color, number, nor symbol match is illegal', () => {
  // Red 0 (value 1) vs active color Blue (3), top Yellow 3 (not a number match)
  assert.equal(isPlayable(1, 33, 3), false);
});
