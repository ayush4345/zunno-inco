"use client";

export default function SoundControls({ sound, onMusicToggle, onSfxToggle, onVolumeChange }) {
  return (
    <div className="sound-controls" aria-label="Audio controls">
      <button
        aria-label={sound.musicEnabled ? "Turn music off" : "Turn music on"}
        aria-pressed={sound.musicEnabled}
        className={`audio-toggle ${sound.musicEnabled ? "is-on" : ""}`}
        onClick={onMusicToggle}
        type="button"
      >
        <span aria-hidden="true" className="audio-icon">♫</span>
        <span>Music</span>
      </button>
      <button
        aria-label={sound.sfxEnabled ? "Turn sound effects off" : "Turn sound effects on"}
        aria-pressed={sound.sfxEnabled}
        className={`audio-toggle ${sound.sfxEnabled ? "is-on" : ""}`}
        onClick={onSfxToggle}
        type="button"
      >
        <span aria-hidden="true" className="audio-icon">✦</span>
        <span>SFX</span>
      </button>
      <label className="audio-volume">
        <span className="sr-only">Master volume</span>
        <input
          aria-label="Master volume"
          max="1"
          min="0"
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          step="0.05"
          type="range"
          value={sound.volume}
        />
      </label>
    </div>
  );
}
