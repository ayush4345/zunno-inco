import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCardPlay,
  getSoundAsset,
  getSoundCue,
  getRevealState,
  getRewardTier,
  getSoundSettings,
  recordEvent,
  transitionMatch,
} from "./gameExperience.mjs";

test("a selected card moves through the private reveal lifecycle", () => {
  let match = { phase: "active", reveal: "idle" };

  match = transitionMatch(match, "card-selected");
  assert.equal(match.reveal, "selected");

  match = transitionMatch(match, "reveal-requested");
  assert.equal(match.reveal, "securing");

  match = transitionMatch(match, "reveal-confirmed");
  assert.deepEqual(getRevealState(match.reveal), {
    label: "Publicly verified",
    isPending: false,
  });
});

test("failed public reveal offers recovery without ending the match", () => {
  const match = transitionMatch(
    { phase: "active", reveal: "securing" },
    "reveal-failed",
  );

  assert.equal(match.phase, "active");
  assert.deepEqual(getRevealState(match.reveal), {
    label: "Reveal needs attention",
    isPending: false,
  });
});

test("sound is silent until the player enables it", () => {
  assert.deepEqual(getSoundSettings({ enabled: false, volume: 0.75 }), {
    canPlay: false,
    volume: 0,
  });
  assert.deepEqual(getSoundSettings({ enabled: true, volume: 0.75 }), {
    canPlay: true,
    volume: 0.75,
  });
});

test("game events resolve to distinct layered arcade cues", () => {
  assert.deepEqual(getSoundCue("card-play").tones, [392, 587]);
  assert.equal(getSoundCue("card-play").waveform, "triangle");
  assert.deepEqual(getSoundCue("victory").tones, [523, 659, 784, 1047]);
  assert.equal(getSoundCue("victory").waveform, "sine");
});

test("critical sound cues describe their synthesis character", () => {
  assert.deepEqual(getSoundCue("deal").noise, "paper");
  assert.deepEqual(getSoundCue("reveal-pulse").sweep, "up");
  assert.deepEqual(getSoundCue("victory").noise, "sparkle");
});

test("interactive events map to bundled audio files", () => {
  assert.equal(getSoundAsset("deal"), "/audio/deal.ogg");
  assert.equal(getSoundAsset("card-play"), "/audio/play.ogg");
  assert.equal(getSoundAsset("victory"), "/audio/victory.ogg");
});

test("a verified card play removes only the selected private card and awards a streak", () => {
  const result = applyCardPlay(["red-7", "blue-2", "wild"], 1, 2, 250);

  assert.deepEqual(result.hand, ["red-7", "wild"]);
  assert.equal(result.streak, 3);
  assert.equal(result.score, 425);
  assert.equal(result.reward, "Triple spark");
});

test("reward tiers and event history remain presentation-safe", () => {
  assert.equal(getRewardTier(0), "Warming up");
  assert.equal(getRewardTier(5), "Hot hand");
  assert.deepEqual(
    recordEvent([{ label: "Table entered", tone: "ui-tap" }], {
      label: "Reveal verified",
      tone: "verified",
    }),
    [
      { label: "Reveal verified", tone: "verified" },
      { label: "Table entered", tone: "ui-tap" },
    ],
  );
});
