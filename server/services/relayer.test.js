const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeFunctionData } = require('viem');
const { validateForwardRequest } = require('./relayer');

const CONTRACT = '0x1138A6984cCBAa8b09a10fd24753c0897F65fB70';
const OTHER = '0x000000000000000000000000000000000000dEaD';

const drawCardData = encodeFunctionData({
  abi: [{ type: 'function', name: 'drawCard', inputs: [{ type: 'uint256' }], outputs: [] }],
  functionName: 'drawCard',
  args: [1n],
});

const claimJackpotData = encodeFunctionData({
  abi: [{ type: 'function', name: 'claimGameJackpot', inputs: [{ type: 'uint256' }], outputs: [] }],
  functionName: 'claimGameJackpot',
  args: [1n],
});

test('allows drawCard targeting the configured contract', () => {
  assert.doesNotThrow(() =>
    validateForwardRequest({ to: CONTRACT, data: drawCardData, value: '0' }, { contractAddress: CONTRACT })
  );
});

test('rejects a request targeting a different contract', () => {
  assert.throws(() =>
    validateForwardRequest({ to: OTHER, data: drawCardData, value: '0' }, { contractAddress: CONTRACT })
  );
});

test('rejects a function that is not allowlisted', () => {
  assert.throws(() =>
    validateForwardRequest({ to: CONTRACT, data: claimJackpotData, value: '0' }, { contractAddress: CONTRACT })
  );
});

test('rejects a request carrying nonzero value', () => {
  assert.throws(() =>
    validateForwardRequest({ to: CONTRACT, data: drawCardData, value: '1' }, { contractAddress: CONTRACT })
  );
});
