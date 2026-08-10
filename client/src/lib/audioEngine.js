"use client";

import { getSoundAsset, getSoundCue } from "./gameExperience.mjs";

let audioContext;
let backgroundTrack;

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext ??= new AudioContext();
  return audioContext;
}

function playNoise(context, character, startAt, duration, volume) {
  if (!character) return;
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const decay = character === "sparkle" ? 1 - index / data.length : 0.45;
    data[index] = (Math.random() * 2 - 1) * decay;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.value = character === "paper" ? 1100 : 3200;
  gain.gain.setValueAtTime(volume * 0.025, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(startAt);
}

export function playGameSound(event, settings) {
  if (!settings.canPlay) return;
  const effect = new Audio(getSoundAsset(event));
  effect.volume = Math.min(1, settings.volume * 0.7);
  effect.play().then(() => duckBackground()).catch(() => playSynthFallback(event, settings));
}

export function setBackgroundMusic(settings) {
  if (typeof window === "undefined") return;
  backgroundTrack ??= new Audio("/audio/arcade-loop.mp3");
  backgroundTrack.loop = true;
  backgroundTrack.volume = Math.min(0.22, settings.volume * 0.28);

  if (!settings.canPlay) {
    backgroundTrack.pause();
    return;
  }

  backgroundTrack.play().catch(() => {});
}

function duckBackground() {
  if (!backgroundTrack || backgroundTrack.paused) return;
  const volume = backgroundTrack.volume;
  backgroundTrack.volume = volume * 0.35;
  window.setTimeout(() => {
    if (backgroundTrack) backgroundTrack.volume = volume;
  }, 220);
}

function playSynthFallback(event, settings) {
  if (!settings.canPlay) return;
  const context = getContext();
  if (!context) return;

  const cue = getSoundCue(event);
  const startAt = context.currentTime;
  if (context.state === "suspended") context.resume();

  cue.tones.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const offset = index * cue.duration * 0.56;
    const toneStart = startAt + offset;
    oscillator.type = cue.waveform;
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    if (cue.sweep === "up") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.17, toneStart + cue.duration);
    if (cue.sweep === "down") oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * 0.78), toneStart + cue.duration);
    gain.gain.setValueAtTime(settings.volume * 0.075, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.001, toneStart + cue.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneStart + cue.duration);
  });

  playNoise(context, cue.noise, startAt, cue.duration * 1.15, settings.volume);
}
