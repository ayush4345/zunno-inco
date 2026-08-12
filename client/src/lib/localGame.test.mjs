import test from "node:test";
import assert from "node:assert/strict";

import { getLocalComputerGameId } from "./localGame.mjs";

test("creates a valid local game id without an on-chain transaction", () => {
  assert.equal(getLocalComputerGameId(1_723_467_400_000), 1_723_467_400_000n);
});
