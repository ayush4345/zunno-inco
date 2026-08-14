import test from "node:test";
import assert from "node:assert/strict";

import { getBufferedGasLimit } from "./transactionGas.mjs";

test("adds a modest buffer to an estimated transaction gas limit", () => {
  assert.equal(getBufferedGasLimit(243225n), 291870n);
});

test("never returns a gas limit over the configured RPC cap", () => {
  assert.equal(getBufferedGasLimit(24_000_000n), 25_000_000n);
});
