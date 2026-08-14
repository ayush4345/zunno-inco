const revealStates = {
  idle: { label: "Ready to play", isPending: false },
  selected: { label: "Card selected", isPending: true },
  securing: { label: "Securing reveal…", isPending: true },
  confirmed: { label: "Publicly verified", isPending: false },
  failed: { label: "Reveal needs attention", isPending: false },
};

const soundCues = {
  "ui-tap": { tones: [440], duration: 0.06, waveform: "sine", sweep: "none" },
  deal: { tones: [330, 392], duration: 0.08, waveform: "triangle", noise: "paper" },
  draw: { tones: [294, 247], duration: 0.1, waveform: "triangle", noise: "paper" },
  "card-play": { tones: [392, 587], duration: 0.12, waveform: "triangle", sweep: "up" },
  "reveal-pulse": { tones: [220, 277, 330], duration: 0.18, waveform: "sine", sweep: "up" },
  verified: { tones: [523, 659], duration: 0.14, waveform: "sine", noise: "sparkle" },
  warning: { tones: [294, 294], duration: 0.1, waveform: "square", sweep: "down" },
  error: { tones: [196, 147], duration: 0.14, waveform: "sawtooth", sweep: "down" },
  victory: { tones: [523, 659, 784, 1047], duration: 0.16, waveform: "sine", noise: "sparkle" },
};

const soundAssets = {
  deal: "/audio/deal.ogg",
  draw: "/audio/draw.ogg",
  "card-play": "/audio/play.ogg",
  "reveal-pulse": "/audio/play.ogg",
  verified: "/audio/verified.ogg",
  victory: "/audio/victory.ogg",
};

export function getSoundCue(event) {
  return soundCues[event] ?? soundCues["ui-tap"];
}

export function getSoundAsset(event) {
  return soundAssets[event] ?? "/audio/play.ogg";
}

export function getRewardTier(streak) {
  if (streak >= 5) return "Hot hand";
  if (streak >= 3) return "Triple spark";
  if (streak >= 1) return "First flame";
  return "Warming up";
}

export function applyCardPlay(hand, selectedIndex, streak, score) {
  const nextHand = hand.filter((_, index) => index !== selectedIndex);
  const nextStreak = streak + 1;

  return {
    hand: nextHand,
    streak: nextStreak,
    score: score + 175,
    reward: getRewardTier(nextStreak),
  };
}

export function recordEvent(events, event) {
  return [event, ...events].slice(0, 3);
}

export function getRevealState(reveal) {
  return revealStates[reveal] ?? revealStates.idle;
}

export function transitionMatch(match, event) {
  const next = { ...match };

  if (event === "card-selected") next.reveal = "selected";
  if (event === "reveal-requested") next.reveal = "securing";
  if (event === "reveal-confirmed") next.reveal = "confirmed";
  if (event === "reveal-failed") next.reveal = "failed";
  if (event === "match-finished") next.phase = "finished";

  return next;
}

export function normalizeSoundSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const isLegacy = Object.hasOwn(source, "enabled");
  const defaultEnabled = true;
  const legacyEnabled = typeof source.enabled === "boolean" ? source.enabled : defaultEnabled;
  const musicEnabled = typeof source.musicEnabled === "boolean"
    ? source.musicEnabled
    : isLegacy
      ? legacyEnabled
      : defaultEnabled;
  const sfxEnabled = typeof source.sfxEnabled === "boolean"
    ? source.sfxEnabled
    : isLegacy
      ? legacyEnabled
      : defaultEnabled;
  const volume = typeof source.volume === "number" && Number.isFinite(source.volume)
    ? Math.min(1, Math.max(0, source.volume))
    : 0.65;

  return { musicEnabled, sfxEnabled, volume };
}

export function getMusicSettings(settings) {
  const normalized = normalizeSoundSettings(settings);
  return {
    canPlay: normalized.musicEnabled,
    volume: normalized.musicEnabled ? normalized.volume : 0,
  };
}

export function getSfxSettings(settings) {
  const normalized = normalizeSoundSettings(settings);
  return {
    canPlay: normalized.sfxEnabled,
    volume: normalized.sfxEnabled ? normalized.volume : 0,
  };
}

export function getSoundSettings(settings) {
  return getMusicSettings(settings);
}

export function getDealingStatus(elapsedMs) {
  return elapsedMs < 475 ? "Creating private table" : "Encrypting your hand";
}
