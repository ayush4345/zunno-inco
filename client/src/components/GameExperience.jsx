"use client";

import { useEffect, useRef, useState } from "react";
import DealingLoader from "@/components/DealingLoader";
import SoundControls from "@/components/SoundControls";
import {
  applyCardPlay,
  getDealingStatus,
  getRevealState,
  getRewardTier,
  normalizeSoundSettings,
  recordEvent,
  transitionMatch,
} from "@/lib/gameExperience.mjs";
import { playGameSound, setBackgroundMusic } from "@/lib/audioEngine.js";

const initialHand = [
  { id: "red-7", label: "7", color: "red" },
  { id: "blue-2", label: "2", color: "blue" },
  { id: "yellow-skip", label: "SKIP", color: "yellow" },
  { id: "green-9", label: "9", color: "green" },
  { id: "red-draw-two", label: "+2", color: "red" },
  { id: "wild", label: "WILD", color: "wild" },
  { id: "blue-4", label: "4", color: "blue" },
];

export default function GameExperience() {
  const [match, setMatch] = useState({ phase: "waiting", reveal: "idle" });
  const [connected, setConnected] = useState(false);
  const [sound, setSound] = useState({ musicEnabled: true, sfxEnabled: true, volume: 0.65 });
  const [isSoundHydrated, setIsSoundHydrated] = useState(false);
  const [dealingStatus, setDealingStatus] = useState(getDealingStatus(0));
  const [playerHand, setPlayerHand] = useState(initialHand);
  const [selectedCard, setSelectedCard] = useState(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [events, setEvents] = useState([{ label: "Table entered", tone: "ui-tap" }]);
  const [toast, setToast] = useState("Create or join a two-player table.");

  const reveal = getRevealState(match.reveal);
  const audioRevision = useRef(0);
  const dealTimers = useRef([]);
  const isActive = match.phase === "active";
  const isFinished = match.phase === "finished";

  useEffect(() => {
    const savedSound = window.localStorage.getItem("zunno-sound");
    if (savedSound) {
      try {
        setSound(normalizeSoundSettings(JSON.parse(savedSound)));
      } catch {
        window.localStorage.removeItem("zunno-sound");
      }
    }
    setIsSoundHydrated(true);
  }, []);

  useEffect(() => {
    if (!isSoundHydrated) return;
    window.localStorage.setItem("zunno-sound", JSON.stringify(sound));
    const revision = ++audioRevision.current;
    setBackgroundMusic(sound).then((result) => {
      if (!result.started && result.reason && audioRevision.current === revision) {
        setToast(result.reason === "blocked" ? "Music needs a browser gesture to start." : "Music could not be started.");
      }
    });
  }, [isSoundHydrated, sound]);

  useEffect(() => () => dealTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    if (match.reveal !== "securing") return;
    const timer = window.setTimeout(() => {
      setMatch((current) => transitionMatch(current, "reveal-confirmed"));
      setPlayerHand((currentHand) => {
        const result = applyCardPlay(currentHand, selectedCard, streak, score);
        setStreak(result.streak);
        setScore(result.score);
        setToast(`${result.reward}: public reveal attested.`);
        setEvents((current) => recordEvent(current, { label: `${result.reward} +175`, tone: "verified" }));
        return result.hand;
      });
      setSelectedCard(null);
      playGameSound("verified", sound);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [match.reveal, score, selectedCard, sound, streak]);

  function connectWallet() {
    setConnected(true);
    setToast("Wallet connected. You can now enter the confidential table.");
    setEvents((current) => recordEvent(current, { label: "Wallet linked", tone: "ui-tap" }));
    playGameSound("ui-tap", sound);
  }

  function startMatch() {
    setMatch({ phase: "dealing", reveal: "idle" });
    setDealingStatus(getDealingStatus(0));
    setToast("Creating a private table…");
    setEvents((current) => recordEvent(current, { label: "Private deal started", tone: "deal" }));
    playGameSound("deal", sound);
    dealTimers.current.forEach((timer) => window.clearTimeout(timer));
    dealTimers.current = [
      window.setTimeout(() => setDealingStatus(getDealingStatus(475)), 475),
      window.setTimeout(() => {
      setMatch({ phase: "active", reveal: "idle" });
      setToast("Your turn. Your hand is private to you.");
      setEvents((current) => recordEvent(current, { label: "Your turn", tone: "ui-tap" }));
      playGameSound("ui-tap", sound);
    }, 950),
    ];
  }

  function selectCard(index) {
    if (!isActive || reveal.isPending) return;
    setSelectedCard(index);
    setMatch((current) => transitionMatch(current, "card-selected"));
    setToast("Card selected locally. Only you can see it right now.");
    setEvents((current) => recordEvent(current, { label: "Card locked privately", tone: "card-play" }));
    playGameSound("card-play", sound);
  }

  function revealCard() {
    if (!isActive || match.reveal !== "selected") return;
    setMatch((current) => transitionMatch(current, "reveal-requested"));
    setToast("Securing the public reveal with Inco covalidators…");
    setEvents((current) => recordEvent(current, { label: "Reveal secured", tone: "reveal-pulse" }));
    playGameSound("reveal-pulse", sound);
  }

  function drawCard() {
    if (!isActive || reveal.isPending) return;
    setPlayerHand((current) => [
      ...current,
      { id: `draw-${Date.now()}`, label: "?", color: "blue" },
    ]);
    setToast("Encrypted card drawn. It stays visible only in your hand.");
    setEvents((current) => recordEvent(current, { label: "Private card drawn", tone: "draw" }));
    playGameSound("draw", sound);
  }

  function finishMatch() {
    setMatch((current) => transitionMatch(current, "match-finished"));
    setToast("Match settled. Payout confirmation would appear here.");
    setCelebrating(true);
    setEvents((current) => recordEvent(current, { label: "Settlement preview", tone: "victory" }));
    playGameSound("victory", sound);
  }

  function retryReveal() {
    setMatch((current) => transitionMatch(current, "card-selected"));
    setToast("Ready to retry the attested reveal.");
    playGameSound("ui-tap", sound);
  }

  return (
    <main className="experience-shell">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="grain" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Zunno Inco home">
          <span className="brand-mark">Z</span>
          <span>ZUNNO <i>×</i> INCO</span>
        </a>
        <div className="topbar-actions">
          <SoundControls
            onMusicToggle={() => {
              setSound((current) => ({ ...current, musicEnabled: !current.musicEnabled }));
              setToast(sound.musicEnabled ? "Music disabled." : "Music enabled.");
            }}
            onSfxToggle={() => {
              setSound((current) => ({ ...current, sfxEnabled: !current.sfxEnabled }));
              setToast(sound.sfxEnabled ? "Sound effects disabled." : "Sound effects enabled.");
              if (!sound.sfxEnabled) playGameSound("ui-tap", { ...sound, sfxEnabled: true });
            }}
            onVolumeChange={(volume) => setSound((current) => ({ ...current, volume }))}
            sound={sound}
          />
          <button
            className={`wallet-button ${connected ? "is-connected" : ""}`}
            onClick={connectWallet}
            type="button"
          >
            <span className="status-dot" />
            {connected ? "0x71…9cE2" : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="game-layout">
        <aside className="status-rail">
          <div className="eyebrow">CONFIDENTIAL TABLE</div>
          <h1>Read the table.<br /><em>Not their hand.</em></h1>
          <p>
            A two-player UNO match where every card remains encrypted until it earns
            its place on the discard pile.
          </p>
          <div className="phase-list" aria-label="Match progress">
            {[
              ["waiting", "Lobby"],
              ["dealing", "Encrypted deal"],
              ["active", "Live match"],
              ["finished", "Settlement"],
            ].map(([phase, label], index) => (
              <div className={`phase ${match.phase === phase ? "is-current" : ""}`} key={phase}>
                <span>{String(index + 1).padStart(2, "0")}</span>{label}
              </div>
            ))}
          </div>
          <div className="pot-card">
            <span>LIVE POT</span>
            <strong>0.020 <small>ETH</small></strong>
            <div><b>2</b> players locked in</div>
          </div>
        </aside>

        <section className={`table ${isActive ? "is-active" : ""}`}>
          <div className="table-lines" />
          <div className="table-top">
            <div className="player-chip opponent">
              <span className="avatar">M</span>
              <div><b>Mika</b><small>{isActive ? "Thinking…" : "Waiting at table"}</small></div>
              <strong>7 <small>CARDS</small></strong>
            </div>
            <div className="match-id">MATCH #0247 <span>•</span> BASE SEPOLIA</div>
            <div className="turn-badge">{isActive ? "YOUR TURN" : match.phase.toUpperCase()}</div>
          </div>
          <div className="game-meter" aria-label="Match score and play streak">
            <div><span>PLAY STREAK</span><strong>{streak}×</strong></div>
            <div className="meter-track"><i style={{ width: `${Math.min(100, score / 5)}%` }} /></div>
            <div><span>TABLE SCORE</span><strong>{score.toString().padStart(4, "0")}</strong></div>
          </div>
          <div className="reward-rail">
            <div className="reward-tier"><span>REWARD TIER</span><strong>{getRewardTier(streak)}</strong></div>
            <div className="event-feed" aria-live="polite">
              {events.map((event) => <span key={`${event.label}-${event.tone}`}>{event.label}</span>)}
            </div>
          </div>

          <div className="opponent-cards" aria-label="Opponent has seven private cards">
            {Array.from({ length: 7 }).map((_, index) => <span key={index} />)}
          </div>

          <div className="board-center">
            <button className="draw-deck" disabled={!isActive || reveal.isPending} onClick={drawCard} type="button">
              <span>DRAW</span>
              <i>PRIVATE</i>
            </button>
            <div className={`discard-card ${match.reveal === "confirmed" ? "is-verified" : ""}`}>
              <span className="discard-label">PUBLIC DISCARD</span>
              <strong>{match.reveal === "confirmed" ? "7" : "?"}</strong>
              <small>{match.reveal === "confirmed" ? "RED" : "ENCRYPTED"}</small>
            </div>
          </div>

          <div className={`reveal-panel ${reveal.isPending ? "is-pending" : ""} ${match.reveal === "failed" ? "is-error" : ""}`}>
            <div className="reveal-orb">{reveal.isPending ? <span className="spinner" /> : "✦"}</div>
            <div>
              <span className="eyebrow">INCO REVEAL STATUS</span>
              <strong>{reveal.label}</strong>
            </div>
            {match.reveal === "selected" && <button onClick={revealCard} type="button">Secure reveal</button>}
            {match.reveal === "failed" && <button onClick={retryReveal} type="button">Try again</button>}
          </div>

          <div className="player-zone">
            <div className="player-chip you">
              <span className="avatar">Y</span>
              <div><b>You</b><small>{playerHand.length <= 2 ? "UNO pressure" : "Hand encrypted locally"}</small></div>
              <strong>{playerHand.length} <small>CARDS</small></strong>
            </div>
            <div className="hand" aria-label="Your encrypted hand">
              {playerHand.map((card, index) => (
                <button
                  aria-label={`Select ${card.color} ${card.label} card`}
                  className={`uno-card ${card.color} ${match.reveal === "selected" && index === selectedCard ? "is-selected" : ""}`}
                  disabled={!isActive || reveal.isPending}
                  key={card.id}
                  onClick={() => selectCard(index)}
                  type="button"
                >
                  <span>{card.label}</span>
                  <i>PRIVATE</i>
                </button>
              ))}
            </div>
            <div className="table-actions">
              {match.phase === "waiting" && <button className="primary-action" disabled={!connected} onClick={startMatch} type="button">Start encrypted deal <span>→</span></button>}
              {match.phase === "dealing" && <DealingLoader status={dealingStatus} />}
              {isActive && <button className="finish-link" onClick={finishMatch} type="button">Preview settlement</button>}
              {isFinished && <button className="primary-action" onClick={() => {
                setMatch({ phase: "waiting", reveal: "idle" });
                setPlayerHand(initialHand);
                setScore(0);
                setStreak(0);
                setCelebrating(false);
                setEvents([{ label: "Fresh table ready", tone: "ui-tap" }]);
              }} type="button">New table <span>↗</span></button>}
            </div>
          </div>
          {celebrating && (
            <div className="victory-overlay" role="status">
              <span>✦</span>
              <div>
                <b>TABLE CLEARED</b>
                <strong>DEMO RECAP</strong>
                <small>{score} score · {streak}× best streak · {playerHand.length} cards remaining</small>
              </div>
            </div>
          )}
        </section>
      </section>

      <footer className="event-log" aria-live="polite">
        <span className="log-pulse" />
        <span>{toast}</span>
        <span className="privacy-note">No hand data is sent through the UI event layer.</span>
      </footer>
    </main>
  );
}
