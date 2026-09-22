"use client";

import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from "react";
import { FeedbackAudio } from "@/lib/feedback-audio";
import { DEFAULT_RANGE, RANGES, numberWord, shuffled } from "@/lib/numbers";

// Opt-in, local-only diagnostics: /math?debugSwipe=1, then window.__mathSwipeLog.
function logSwipe(event: string, details: Record<string, number | string>) {
  if (!new URLSearchParams(window.location.search).has("debugSwipe")) return;
  const debugWindow = window as Window & { __mathSwipeLog?: Record<string, unknown>[] };
  const entries = debugWindow.__mathSwipeLog ??= [];
  const entry = { event, time: Math.round(performance.now()), ...details };
  entries.push(entry);
  if (entries.length > 100) entries.shift();
  console.debug("[math swipe]", entry);
}

function SpeakerIcon() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>;
}

// New batches include every number, with no repeated number at the join.
function nextBatch(numbers: number[], neighbor?: number, prepend = false) {
  const batch = shuffled(numbers);
  const edge = prepend ? batch.length - 1 : 0;
  if (batch.length > 1 && batch[edge] === neighbor) {
    // Choose uniformly among the other positions when avoiding a repeat.
    const offset = Math.floor(Math.random() * (batch.length - 1));
    const other = prepend ? offset : offset + 1;
    [batch[edge], batch[other]] = [batch[other], batch[edge]];
  }
  return batch;
}

export default function MathPractice() {
  const [cards, setCards] = useState<{ deck: number[]; index: number }>({ deck: [], index: 0 });
  const cardsRef = useRef(cards);
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE.id);
  const rangeRef = useRef(DEFAULT_RANGE);
  const settings = useRef<HTMLDialogElement | null>(null);
  const gear = useRef<HTMLButtonElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const feed = useRef<HTMLDivElement | null>(null);
  const touching = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const targetPage = useRef<number | null>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const feedbackAudio = useRef<FeedbackAudio | null>(null);
  const feedbackPressed = useRef(false);
  const playback = useRef(0);

  const current = cards.deck[cards.index];
  const word = current === undefined ? "" : numberWord(current);

  useEffect(() => {
    let range = DEFAULT_RANGE;
    try { range = RANGES.find(r => r.id === localStorage.getItem("math-number-range")) ?? range; } catch {}
    rangeRef.current = range;
    setRangeId(range.id);
    const first = nextBatch(range.numbers);
    const before = nextBatch(range.numbers, first[0], true);
    const initial = { deck: [...before, ...first], index: before.length };
    cardsRef.current = initial;
    setCards(initial);
  }, []);

  function stopAudio() {
    playback.current += 1;
    audio.current?.pause();
    feedbackAudio.current?.stop();
    setSpeaking(false);
  }
  useEffect(() => {
    const player = audio.current;
    // Prepare both sounds before a tap; the audio context stays suspended until a gesture.
    const feedback = new FeedbackAudio();
    feedbackAudio.current = feedback;
    return () => { playback.current += 1; player?.pause(); feedback.dispose(); feedbackAudio.current = null; if (settling.current) clearTimeout(settling.current); };
  }, []);

  function playFeedback(correct: boolean) {
    stopAudio();
    setError("");
    const request = playback.current;
    const player = feedbackAudio.current ??= new FeedbackAudio();
    void player.play(correct).catch(() => {
      if (request === playback.current) setError("Feedback sound could not play. Tap to retry.");
    });
  }

  function feedbackPointerDown(event: React.PointerEvent<HTMLButtonElement>, correct: boolean) {
    if (!event.isPrimary || event.button !== 0) return;
    feedbackPressed.current = true;
    playFeedback(correct);
  }

  function feedbackClick(event: React.MouseEvent<HTMLButtonElement>, correct: boolean) {
    // Pointer presses already sounded; keyboard and assistive clicks still work.
    if (event.detail === 0 || !feedbackPressed.current) playFeedback(correct);
    feedbackPressed.current = false;
  }

  function pronounce() {
    const player = audio.current;
    if (!player || current === undefined) return;
    stopAudio();
    setError("");
    const request = playback.current;
    if (player.error) player.load();
    player.currentTime = 0;
    // Call play directly in the click handler, preserving iPhone tap authorization.
    void player.play().catch(() => {
      if (request !== playback.current) return;
      setSpeaking(false);
      setError("Audio could not play. Check your volume and tap to retry.");
    });
  }
  function advance(step: number) {
    const previous = cardsRef.current;
    if (!previous.deck.length) return;
    stopAudio(); setError("");
    let deck = previous.deck;
    let index = previous.index + step;
    if (index >= deck.length - 1) deck = [...deck, ...nextBatch(rangeRef.current.numbers, deck[deck.length - 1])];
    if (index < 1) {
      const batch = nextBatch(rangeRef.current.numbers, deck[0], true);
      deck = [...batch, ...deck];
      index += batch.length;
    }
    const next = { deck, index };
    logSwipe("advance", { step, number: deck[index] });
    cardsRef.current = next;
    setCards(next);
  }

  // Keep only three full-height pages mounted. Recenter after the native scroll
  // settles, preserving the visible card and its previously visited neighbors.
  useLayoutEffect(() => {
    const element = feed.current;
    if (!element || !cards.deck.length) return;
    targetPage.current = null;
    element.scrollTo({ top: element.clientHeight, behavior: "instant" });
  }, [cards]);

  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (settling.current) clearTimeout(settling.current);
      targetPage.current = null;
      gesture.current = null;
      element.scrollTo({ top: element.clientHeight, behavior: "instant" });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function finishScroll() {
    const element = feed.current;
    if (!element || touching.current || settings.current?.open || !cardsRef.current.deck.length) return;
    const page = Math.round(element.scrollTop / element.clientHeight);
    // Safari may start its own snap-back on release. Honor the deliberate swipe
    // instead of committing that competing animation's destination.
    if (targetPage.current !== null && Math.abs(element.scrollTop - targetPage.current * element.clientHeight) > 2) {
      scrollToPage(targetPage.current);
      return;
    }
    // Do not rebase mid-animation or before native snapping has completed.
    if (Math.abs(element.scrollTop - page * element.clientHeight) > 2) return;
    targetPage.current = null;
    if (page !== 1) advance(page === 0 ? -1 : 1);
  }

  function queueSettle() {
    if (settling.current) clearTimeout(settling.current);
    settling.current = setTimeout(finishScroll, 180);
  }

  function scrollToPage(page: number) {
    const element = feed.current;
    if (!element || settings.current?.open) return;
    stopAudio();
    targetPage.current = page;
    element.scrollTo({ top: page * element.clientHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    queueSettle();
  }

  function move(step: number) { scrollToPage(step > 0 ? 2 : 0); }

  function startTouch(event: TouchEvent<HTMLDivElement>) {
    touching.current = true;
    targetPage.current = null;
    if (settling.current) clearTimeout(settling.current);
    const touch = event.touches[0];
    gesture.current = event.touches.length === 1
      ? { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: performance.now() }
      : null;
  }

  function endTouch(event: TouchEvent<HTMLDivElement>, cancelled = false) {
    touching.current = event.touches.length > 0;
    const start = gesture.current;
    gesture.current = null;
    if (touching.current) return;
    const end = Array.from(event.changedTouches).find(touch => touch.identifier === start?.id);
    if (!start || !end) { queueSettle(); return; }
    const dy = start.y - end.clientY;
    const dx = start.x - end.clientX;
    // Distance, not screen height: short intentional swipes work on tall phones.
    const deliberate = !cancelled && Math.abs(dy) >= 28 && Math.abs(dy) > Math.abs(dx) * 1.25;
    const page = deliberate ? (dy > 0 ? 2 : 0) : 1;
    logSwipe("release", { dy: Math.round(dy), dx: Math.round(dx), duration: Math.round(performance.now() - start.time), target: page, decision: cancelled ? "cancel" : deliberate ? "advance" : "snap-back" });
    // A stationary tap must not cancel the sound that started on pointer-down.
    if (!deliberate && feed.current && Math.abs(feed.current.scrollTop - feed.current.clientHeight) <= 2) {
      targetPage.current = null;
      return;
    }
    scrollToPage(page);
  }

  function chooseRange(id: string) {
    const range = RANGES.find(r => r.id === id);
    if (!range) return;
    stopAudio(); setError(""); touching.current = false;
    gesture.current = null; targetPage.current = null;
    if (settling.current) clearTimeout(settling.current);
    rangeRef.current = range;
    setRangeId(id);
    const first = nextBatch(range.numbers);
    const before = nextBatch(range.numbers, first[0], true);
    const next = { deck: [...before, ...first], index: before.length };
    cardsRef.current = next; setCards(next);
    try { localStorage.setItem("math-number-range", id); } catch {}
    settings.current?.close();
  }

  return <main className="app" tabIndex={0} aria-label="Number flashcards. Swipe up for next, down for previous, or use the arrow keys."
        onPointerDownCapture={() => feedbackAudio.current?.unlock()}
        onTouchEndCapture={() => feedbackAudio.current?.unlock()}
        onKeyDownCapture={() => feedbackAudio.current?.unlock()}
        onKeyDown={event => {
          if (settings.current?.open) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault(); move(event.key === "ArrowUp" ? 1 : -1);
          }
        }}
        >
        <button ref={gear} className="settings-toggle" aria-label="Number range settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="range-settings"
          onClick={() => { stopAudio(); settings.current?.showModal(); setSettingsOpen(true); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 3-.6 2.1-1.8 1L4.5 6 3 8.6l1.5 1.6v2L3 14l1.5 2.6 2.1-.3 1.8 1L9 20h3l.6-2.7 1.8-1 2.1.3L18 14l-1.5-1.8v-2L18 8.6 16.5 6l-2.1.1-1.8-1L12 3Z" transform="translate(1.5 .5)"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <dialog ref={settings} id="range-settings" className="settings-menu" aria-labelledby="range-title"
          onClose={() => { setSettingsOpen(false); gear.current?.focus(); }}
          onClick={event => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
          }}>
          <div className="settings-heading"><h2 id="range-title">Number range</h2><button className="settings-close" aria-label="Close settings" onClick={() => settings.current?.close()}>×</button></div>
          <div className="range-options" role="group" aria-label="Number range">
            {RANGES.map(range => <button key={range.id} className="range-option" aria-pressed={rangeId === range.id} onClick={() => chooseRange(range.id)}>
              <span>{range.label}{range.description && <small>{range.description}</small>}</span><span aria-hidden="true">{rangeId === range.id ? "✓" : ""}</span>
            </button>)}
          </div>
          <p className="voice-credit">AI-generated voice · OpenAI Marin</p>
        </dialog>
        <div ref={feed} className="card-feed" aria-label="Swipe through numbers"
          onTouchStart={startTouch}
          onTouchEnd={event => endTouch(event)}
          onTouchCancel={event => endTouch(event, true)}
          onScroll={() => {
            const element = feed.current;
            if (element && Math.abs(element.scrollTop - element.clientHeight) > 2) stopAudio();
            queueSettle();
          }}
          onScrollEnd={finishScroll}>
          {cards.deck.length ? [-1, 0, 1].map(offset => {
            const position = cards.index + offset;
            const value = cards.deck[position];
            const active = offset === 0;
            return <section className="flashcard" key={`${rangeId}-${position}`} aria-hidden={!active} inert={!active}>
              <div className="card-face">
                <div className="number-wrap"><h2 className="number">{value}</h2><span className="number-word">{numberWord(value)}</span></div>
                <div className="card-actions">
                <button className="feedback correct" aria-label="Correct" tabIndex={active ? 0 : -1} onPointerDown={event => feedbackPointerDown(event, true)} onClick={event => feedbackClick(event, true)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                </button>
                <button className={`hear ${active && speaking ? "speaking" : ""} ${active && error ? "audio-failed" : ""}`}
                  aria-label={active && error ? error : `Hear ${numberWord(value)}`} tabIndex={active ? 0 : -1} onClick={pronounce}><SpeakerIcon/></button>
                <button className="feedback incorrect" aria-label="Incorrect" tabIndex={active ? 0 : -1} onPointerDown={event => feedbackPointerDown(event, false)} onClick={event => feedbackClick(event, false)}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
                </div>
              </div>
            </section>;
          }) : <section className="flashcard" aria-hidden="true" />}
        </div>
        <span className="sr-only" aria-live="polite" aria-atomic="true">{word}</span>
        <audio ref={audio} src={current === undefined ? undefined : `/math/audio/openai-marin-eea49933a200/${current}.mp3`} preload="auto"
          onPlaying={() => setSpeaking(true)} onEnded={() => setSpeaking(false)} onPause={() => setSpeaking(false)}
          onError={() => { setSpeaking(false); setError("Audio could not load. Tap to retry."); }} />
        <span className="sr-only" role="status">{error}</span>
        <nav className="sr-only" aria-label="Flashcard navigation"><button onClick={() => move(-1)} tabIndex={-1}>Previous number</button><button onClick={() => move(1)} tabIndex={-1}>Next number</button></nav>
    </main>;
}
