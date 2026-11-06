"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { recordDiagnostic, subscribeDiagnostics, diagnosticsText, type DiagnosticEntry } from "@/lib/diagnostics";
import { FeedbackAudio, configureAudioSession } from "@/lib/feedback-audio";
import { DEFAULT_RANGE, RANGES, numberWord, shuffled } from "@/lib/numbers";
import { WORD_GROUPS, ALL_WORDS, DEFAULT_WORD_GROUPS, selectedWords, validWordGroups, displayWord } from "@/lib/words";
import wordAudio from "@/lib/word-audio.json";

type Card = number | string;
type Deck = { deck: Card[]; index: number };
type Feed = "numbers" | "words";
type PracticeSet = { numbers: Card[]; ordered?: boolean };
function cardText(value: Card) { return typeof value === "number" ? numberWord(value) : displayWord(value); }
function freshDeck(range: PracticeSet): Deck {
  const first = nextBatch(range);
  const before = nextBatch(range, first[0], true);
  return { deck: [...before, ...first], index: before.length };
}

// Opt-in, local-only diagnostics: /math?debugSwipe=1, then window.__mathSwipeLog.
function logSwipe(event: string, details: Record<string, number | string>) {
  recordDiagnostic(`Swipe ${event}: ${JSON.stringify(details)}`);
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

// Ordered practice keeps confusing groups together; other ranges shuffle without repeats at the join.
function nextBatch(range: PracticeSet, neighbor?: Card, prepend = false) {
  if (range.ordered) return [...range.numbers];
  const batch = shuffled(range.numbers);
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
  const [cards, setCards] = useState<Deck>({ deck: [], index: 0 });
  const cardsRef = useRef(cards);
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE.id);
  const rangeRef = useRef<PracticeSet>(DEFAULT_RANGE);
  const [mode, setMode] = useState<Feed>("numbers");
  const modeRef = useRef<Feed>("numbers");
  const [wordGroups, setWordGroups] = useState<string[]>(DEFAULT_WORD_GROUPS);
  const wordGroupsRef = useRef<string[]>(DEFAULT_WORD_GROUPS);
  const savedDecks = useRef<Partial<Record<Feed, Deck>>>({});
  const settings = useRef<HTMLDialogElement | null>(null);
  const numberTab = useRef<HTMLButtonElement | null>(null);
  const wordTab = useRef<HTMLButtonElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const feed = useRef<HTMLDivElement | null>(null);
  const touching = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const targetPage = useRef<number | null>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnimation = useRef<number | null>(null);
  const rebasing = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const feedbackAudio = useRef<FeedbackAudio | null>(null);
  const feedbackPressed = useRef(false);
  const speakerPressed = useRef(false);
  const buttonTouch = useRef<{ x: number; y: number } | null>(null);
  const playback = useRef(0);
  const speechMonitor = useRef<ReturnType<typeof setInterval> | null>(null);
  const reloadSpeech = useRef(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let enabled = new URLSearchParams(window.location.search).has("debugAudio");
    try { enabled ||= localStorage.getItem("math-diagnostics") === "true"; } catch {}
    setShowDiagnostics(enabled);
    return subscribeDiagnostics(setDiagnostics);
  }, []);

  function toggleDiagnostics() {
    const enabled = !showDiagnostics;
    setShowDiagnostics(enabled);
    try { localStorage.setItem("math-diagnostics", String(enabled)); } catch {}
  }

  async function copyDiagnostics() {
    try { await navigator.clipboard.writeText(diagnosticsText()); setCopyStatus("Copied"); }
    catch { setCopyStatus("Could not copy. Select the visible log instead."); }
  }

  const current = cards.deck[cards.index];
  const word = current === undefined ? "" : cardText(current);

  useEffect(() => {
    let range = DEFAULT_RANGE;
    try {
      const saved = localStorage.getItem("math-number-range");
      const id = saved === "11-29" ? "13-19" : saved;
      range = RANGES.find(r => r.id === id) ?? range;
      if (saved === "11-29") localStorage.setItem("math-number-range", range.id);
    } catch {}
    try {
      const groups = validWordGroups(JSON.parse(localStorage.getItem("math-word-groups") ?? "null"));
      wordGroupsRef.current = groups;
      setWordGroups(groups);
    } catch {}
    rangeRef.current = range;
    setRangeId(range.id);
    const initial = freshDeck(range);
    cardsRef.current = initial;
    setCards(initial);
  }, []);

  function stopAudio() {
    playback.current += 1;
    if (speechMonitor.current) clearInterval(speechMonitor.current);
    speechMonitor.current = null;
    audio.current?.pause();
    feedbackAudio.current?.stop();
    setSpeaking(false);
  }
  useEffect(() => {
    const player = audio.current;
    // Prepare both sounds before a tap; the audio context stays suspended until a gesture.
    configureAudioSession();
    const feedback = new FeedbackAudio();
    feedbackAudio.current = feedback;
    const lifecycle = (event: Event) => {
      recordDiagnostic(`Page ${event.type} · ${document.visibilityState}`);
      stopAudio();
      feedback.invalidate();
      reloadSpeech.current = true;
      feedbackPressed.current = false;
    };
    document.addEventListener("visibilitychange", lifecycle);
    window.addEventListener("pagehide", lifecycle);
    window.addEventListener("pageshow", lifecycle);
    return () => {
      document.removeEventListener("visibilitychange", lifecycle);
      window.removeEventListener("pagehide", lifecycle);
      window.removeEventListener("pageshow", lifecycle);
      stopAudio(); player?.pause(); feedback.dispose(); feedbackAudio.current = null;
      if (settling.current) clearTimeout(settling.current);
      if (scrollAnimation.current !== null) cancelAnimationFrame(scrollAnimation.current);
    };
  }, []);

  function playFeedback(correct: boolean) {
    recordDiagnostic(`${correct ? "Correct" : "Incorrect"} button triggered · card ${cardsRef.current.deck[cardsRef.current.index]}`);
    stopAudio();
    setError("");
    const request = playback.current;
    const player = feedbackAudio.current ??= new FeedbackAudio();
    void player.play(correct).catch(error => {
      if (request === playback.current) { recordDiagnostic(`Feedback playback failed: ${String(error)}`); setError("Feedback sound could not play. Tap to retry."); }
    });
  }

  function feedbackPointerDown(event: React.PointerEvent<HTMLButtonElement>, correct: boolean) {
    if (!event.isPrimary || event.button !== 0) return;
    buttonTouch.current = { x: event.clientX, y: event.clientY };
    // Cold/interrupted engines start on pointer-up, after touch activation.
    feedbackPressed.current = feedbackAudio.current?.ready ?? false;
    if (feedbackPressed.current) playFeedback(correct);
  }

  function soundPointerUp(event: React.PointerEvent<HTMLButtonElement>, correct?: boolean) {
    const start = buttonTouch.current;
    buttonTouch.current = null;
    if (!start || !event.isPrimary || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 24) return;
    // Browsers can suppress click after a small drag even with scrolling disabled.
    if (correct === undefined) { speakerPressed.current = true; pronounce(); }
    else if (!feedbackPressed.current) { feedbackPressed.current = true; playFeedback(correct); }
  }

  function feedbackClick(event: React.MouseEvent<HTMLButtonElement>, correct: boolean) {
    // Pointer presses already sounded; keyboard and assistive clicks still work.
    if (event.detail === 0 || !feedbackPressed.current) playFeedback(correct);
    feedbackPressed.current = false;
  }

  function pronounce() {
    const player = audio.current;
    if (!player || current === undefined) return;
    recordDiagnostic(`Speaker button triggered · card ${current} · readyState ${player.readyState}`);
    stopAudio();
    setError("");
    const request = playback.current;
    configureAudioSession();
    const fail = (failure: unknown) => {
      if (request !== playback.current) return;
      recordDiagnostic(`Speech playback failed: ${String(failure)} · readyState ${player.readyState} · networkState ${player.networkState}`);
      stopAudio();
      reloadSpeech.current = true;
      setError("Audio could not play. Tap to retry.");
    };
    let position = 0;
    let progressedAt = performance.now();
    speechMonitor.current = setInterval(() => {
      if (player.ended) {
        if (speechMonitor.current) clearInterval(speechMonitor.current);
        speechMonitor.current = null;
        return;
      }
      if (player.currentTime > position) { position = player.currentTime; progressedAt = performance.now(); }
      if (performance.now() - progressedAt > 4000) fail(new Error("Playback stalled"));
    }, 250);
    try {
      if (player.error || reloadSpeech.current) { player.load(); reloadSpeech.current = false; }
      player.currentTime = 0;
      // Call play directly in the click handler, preserving iPhone tap authorization.
      void player.play().catch(fail);
    } catch (failure) { fail(failure); }
  }
  function advance(step: number) {
    const previous = cardsRef.current;
    if (!previous.deck.length) return;
    stopAudio(); setError("");
    let deck = previous.deck;
    let index = previous.index + step;
    if (index >= deck.length - 1) deck = [...deck, ...nextBatch(rangeRef.current, deck[deck.length - 1])];
    if (index < 1) {
      const batch = nextBatch(rangeRef.current, deck[0], true);
      deck = [...batch, ...deck];
      index += batch.length;
    }
    const next = { deck, index };
    logSwipe("advance", { step, number: deck[index] });
    rebasing.current = true;
    cardsRef.current = next;
    setCards(next);
  }

  // Keep only three full-height pages mounted. Recenter after the scroll
  // settles, preserving the visible card and its previously visited neighbors.
  useLayoutEffect(() => {
    const element = feed.current;
    if (!element || !cards.deck.length) return;
    targetPage.current = null;
    element.scrollTo({ top: element.clientHeight, behavior: "instant" });
    delete element.dataset.settling;
    delete element.dataset.dragging;
    rebasing.current = false;
  }, [cards]);

  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (settling.current) clearTimeout(settling.current);
      cancelScrollAnimation();
      delete element.dataset.dragging;
      targetPage.current = null;
      gesture.current = null;
      element.scrollTo({ top: element.clientHeight, behavior: "instant" });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function finishScroll() {
    const element = feed.current;
    if (!element || touching.current || scrollAnimation.current !== null || rebasing.current || settings.current?.open || !cardsRef.current.deck.length) return;
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
    if (touching.current || scrollAnimation.current !== null || rebasing.current) return;
    settling.current = setTimeout(finishScroll, 100);
  }

  function cancelScrollAnimation() {
    if (scrollAnimation.current !== null) cancelAnimationFrame(scrollAnimation.current);
    scrollAnimation.current = null;
    if (feed.current) delete feed.current.dataset.settling;
  }

  function scrollToPage(page: number) {
    const element = feed.current;
    if (!element || settings.current?.open || rebasing.current) return;
    if (scrollAnimation.current !== null && targetPage.current === page) return;
    cancelScrollAnimation();
    if (settling.current) clearTimeout(settling.current);
    stopAudio();
    targetPage.current = page;
    // Native smooth scrolling has a long, browser-dependent tail and can compete
    // with CSS snapping. Own just the release animation; dragging stays native.
    element.dataset.settling = "true";
    delete element.dataset.dragging;
    let from = element.scrollTop;
    const to = page * element.clientHeight;
    let distance = to - from;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0
      : Math.min(200, Math.max(100, Math.abs(distance) / element.clientHeight * 200));
    let started: number | null = null;
    const tick = (now: number) => {
      if (started === null) {
        // The compositor can deliver one last drag offset after touch-end. Start
        // from that displayed position rather than jumping back a few pixels.
        started = now;
        from = element.scrollTop;
        distance = to - from;
        logSwipe("settle-start", { from: Math.round(from), to, duration: Math.round(duration) });
      }
      const progress = duration ? Math.max(0, Math.min(1, (now - started) / duration)) : 1;
      const eased = progress * (2 - progress);
      element.scrollTo({ top: from + distance * eased, behavior: "instant" });
      if (progress < 1) { scrollAnimation.current = requestAnimationFrame(tick); return; }
      scrollAnimation.current = null;
      targetPage.current = null;
      logSwipe("settled", { duration: Math.round(now - started), page });
      if (page !== 1) advance(page === 0 ? -1 : 1);
      else delete element.dataset.settling;
    };
    if (duration === 0) tick(performance.now());
    else scrollAnimation.current = requestAnimationFrame(tick);
  }

  function move(step: number) { scrollToPage(step > 0 ? 2 : 0); }

  function startTouch(event: TouchEvent<HTMLDivElement>) {
    if ((event.target as Element).closest(".card-actions")) return;
    if (feed.current) feed.current.dataset.dragging = "true";
    cancelScrollAnimation();
    touching.current = true;
    targetPage.current = null;
    if (settling.current) clearTimeout(settling.current);
    const touch = event.touches[0];
    gesture.current = event.touches.length === 1
      ? { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: performance.now() }
      : null;
  }

  function endTouch(event: TouchEvent<HTMLDivElement>, cancelled = false) {
    if ((event.target as Element).closest(".card-actions")) return;
    touching.current = event.touches.length > 0;
    const start = gesture.current;
    gesture.current = null;
    if (touching.current) return;
    const end = Array.from(event.changedTouches).find(touch => touch.identifier === start?.id);
    if (!start || !end) {
      if (feed.current) delete feed.current.dataset.dragging;
      queueSettle(); return;
    }
    const dy = start.y - end.clientY;
    const dx = start.x - end.clientX;
    // Distance, not screen height: short intentional swipes work on tall phones.
    const deliberate = !cancelled && Math.abs(dy) >= 28 && Math.abs(dy) > Math.abs(dx) * 1.25;
    const page = deliberate ? (dy > 0 ? 2 : 0) : 1;
    logSwipe("release", { dy: Math.round(dy), dx: Math.round(dx), duration: Math.round(performance.now() - start.time), target: page, decision: cancelled ? "cancel" : deliberate ? "advance" : "snap-back" });
    // A stationary tap must not cancel the sound that started on pointer-down.
    if (!deliberate && feed.current && Math.abs(feed.current.scrollTop - feed.current.clientHeight) <= 2) {
      delete feed.current.dataset.dragging;
      targetPage.current = null;
      return;
    }
    scrollToPage(page);
  }

  function resetInteraction() {
    cancelScrollAnimation();
    stopAudio(); setError(""); touching.current = false;
    gesture.current = null; targetPage.current = null; buttonTouch.current = null;
    feedbackPressed.current = false; speakerPressed.current = false;
    if (settling.current) clearTimeout(settling.current);
    if (feed.current) {
      delete feed.current.dataset.dragging;
      feed.current.scrollTo({ top: feed.current.clientHeight, behavior: "instant" });
    }
  }

  function setDeck(next: Deck) { cardsRef.current = next; setCards(next); }

  function selectFeed(next: Feed) {
    resetInteraction();
    if (next === modeRef.current) {
      settings.current?.showModal(); setSettingsOpen(true);
      return;
    }
    savedDecks.current[modeRef.current] = cardsRef.current;
    modeRef.current = next;
    setMode(next);
    const range: PracticeSet = next === "numbers"
      ? RANGES.find(range => range.id === rangeId) ?? DEFAULT_RANGE
      : { numbers: selectedWords(wordGroupsRef.current) };
    rangeRef.current = range;
    setDeck(savedDecks.current[next] ?? freshDeck(range));
    recordDiagnostic(`Feed selected: ${next}`);
  }

  function chooseRange(id: string) {
    const range = RANGES.find(r => r.id === id);
    if (!range) return;
    resetInteraction();
    rangeRef.current = range;
    recordDiagnostic(`Range selected: ${range.label}`);
    setRangeId(id);
    setDeck(freshDeck(range));
    try { localStorage.setItem("math-number-range", id); } catch {}
    settings.current?.close();
  }

  function toggleWordGroup(id: string) {
    const previous = wordGroupsRef.current;
    let next: string[];
    if (id === "all") next = ["all"];
    else if (previous.includes("all")) next = [id];
    else if (previous.includes(id)) next = previous.filter(group => group !== id);
    else next = [...previous, id];
    if (!next.length) return;
    resetInteraction();
    wordGroupsRef.current = next;
    setWordGroups(next);
    const range = { numbers: selectedWords(next) };
    rangeRef.current = range;
    setDeck(freshDeck(range));
    try { localStorage.setItem("math-word-groups", JSON.stringify(next)); } catch {}
    recordDiagnostic(`Word groups selected: ${next.join(", ")} · ${range.numbers.length} words`);
  }

  return <main className="app" tabIndex={0} aria-label="Flashcards. Swipe up for next, down for previous, or use the arrow keys."
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
        <nav className="feed-tabs" aria-label="Practice feed">
          <button ref={wordTab} aria-label="ABC words" aria-pressed={mode === "words"} aria-haspopup="dialog" aria-expanded={mode === "words" && settingsOpen} aria-controls="range-settings" onClick={() => selectFeed("words")}>ABC</button>
          <button ref={numberTab} aria-label="123 numbers" aria-pressed={mode === "numbers"} aria-haspopup="dialog" aria-expanded={mode === "numbers" && settingsOpen} aria-controls="range-settings" onClick={() => selectFeed("numbers")}>123</button>
        </nav>
        <dialog ref={settings} id="range-settings" className="settings-menu" aria-labelledby="range-title"
          onClose={() => { setSettingsOpen(false); (modeRef.current === "numbers" ? numberTab : wordTab).current?.focus(); }}
          onClick={event => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
          }}>
          <div className="settings-heading"><h2 id="range-title">{mode === "numbers" ? "Number range" : "Word groups"}</h2><button className="settings-close" aria-label="Close settings" onClick={() => settings.current?.close()}>×</button></div>
          {mode === "numbers" ? <div className="range-options" role="group" aria-label="Number range">
            {RANGES.map(range => <button key={range.id} className="range-option" aria-pressed={rangeId === range.id} onClick={() => chooseRange(range.id)}>
              <span>{range.label}{range.description && <small>{range.description}</small>}</span><span aria-hidden="true">{rangeId === range.id ? "✓" : ""}</span>
            </button>)}
          </div> : <>
            <p className="menu-note">Choose one or more sets. Words always shuffle. Keep at least one set selected.</p>
            <div className="range-options" role="group" aria-label="Word groups">
              <button className="range-option" aria-pressed={wordGroups.includes("all")} onClick={() => toggleWordGroup("all")}><span>All {ALL_WORDS.length} words</span><span aria-hidden="true">{wordGroups.includes("all") ? "✓" : ""}</span></button>
              {WORD_GROUPS.map((group, index) => <button key={group.id} className="range-option" aria-pressed={wordGroups.includes(group.id)} onClick={() => toggleWordGroup(group.id)}>
                <span>{index + 1}. {group.label}<small>{group.words.length} words · {group.words.map(displayWord).join(", ")}</small>{wordGroups.includes(group.id) && <small className="group-tip">{group.note}</small>}</span>
                <span aria-hidden="true">{wordGroups.includes(group.id) ? "✓" : ""}</span>
              </button>)}
            </div>
            <details className="practice-notes"><summary>About word practice</summary><p>Start with familiar letter sounds, mix in a few tricky words, and revisit sets on different days. Try reading before tapping the speaker. Use these cards alongside phonics instruction and shared reading.</p><p>The first 300 Children’s Picture Book high-frequency words, grouped for practice. These groups are an app adaptation, not a validated teaching sequence.</p><a href="https://doi.org/10.1002/trtr.2309" target="_blank" rel="noreferrer">Word-list research</a></details>
          </>}
          <button className="diagnostics-toggle" role="switch" aria-checked={showDiagnostics} onClick={toggleDiagnostics}>Diagnostics {showDiagnostics ? "on" : "off"}</button>
          <p className="voice-credit">AI-generated voice · OpenAI Marin</p>
        </dialog>
        <div ref={feed} className="card-feed" aria-label={mode === "numbers" ? "Swipe through numbers" : "Swipe through words"}
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
            return <section className="flashcard" key={`${mode}-${rangeId}-${position}`} aria-hidden={!active} inert={!active}>
              <div className="card-face">
                <div className="number-wrap">{typeof value === "number"
                  ? <><h2 className="number">{value}</h2><span className="number-word">{numberWord(value)}</span></>
                  : <h2 className="sight-word" style={{ "--word-length": Math.max(3, displayWord(value).length) } as CSSProperties}>{displayWord(value)}</h2>}</div>
                <div className="card-actions">
                <button className="feedback correct" aria-label="Correct" tabIndex={active ? 0 : -1} onPointerDown={event => feedbackPointerDown(event, true)} onPointerUp={event => soundPointerUp(event, true)} onPointerCancel={() => { feedbackPressed.current = false; buttonTouch.current = null; }} onClick={event => feedbackClick(event, true)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                </button>
                <button className="feedback incorrect" aria-label="Incorrect" tabIndex={active ? 0 : -1} onPointerDown={event => feedbackPointerDown(event, false)} onPointerUp={event => soundPointerUp(event, false)} onPointerCancel={() => { feedbackPressed.current = false; buttonTouch.current = null; }} onClick={event => feedbackClick(event, false)}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
                <button className={`hear ${active && speaking ? "speaking" : ""} ${active && error ? "audio-failed" : ""}`}
                  aria-label={active && error ? error : `Hear ${cardText(value)}`} tabIndex={active ? 0 : -1}
                  onPointerDown={event => { if (event.isPrimary && event.button === 0) { speakerPressed.current = false; buttonTouch.current = { x: event.clientX, y: event.clientY }; } }}
                  onPointerUp={event => soundPointerUp(event)}
                  onPointerCancel={() => { speakerPressed.current = false; buttonTouch.current = null; }}
                  onClick={event => { if (event.detail === 0 || !speakerPressed.current) pronounce(); speakerPressed.current = false; }}><SpeakerIcon/></button>
                </div>
              </div>
            </section>;
          }) : <section className="flashcard" aria-hidden="true" />}
        </div>
        {showDiagnostics && <aside className="diagnostics-panel" aria-label="Audio diagnostics">
          <strong>Diagnostics</strong>
          <p role="status">{diagnostics.at(-1)?.message ?? "Ready — press a sound button"}</p>
          <details><summary>Event log ({diagnostics.length})</summary>
            <p className="diagnostics-note">Local log only. Playback events confirm browser activity, not device volume or audibility.</p>
            <pre>{diagnostics.map(entry => `${entry.time} ${entry.message}`).join("\n")}</pre>
            <button onClick={copyDiagnostics}>Copy log</button><span role="status">{copyStatus}</span>
          </details>
        </aside>}
        <span className="sr-only" aria-live="polite" aria-atomic="true">{word}</span>
        <audio ref={audio} src={current === undefined ? undefined : typeof current === "number" ? `/math/audio/openai-marin-eea49933a200/${current}.mp3` : `/math/${wordAudio.directory}/${encodeURIComponent(current)}.mp3`} preload="auto"
          onPlaying={() => { setSpeaking(true); recordDiagnostic(`Card ${current}: playing`); }} onEnded={() => { setSpeaking(false); recordDiagnostic(`Card ${current}: finished`); }} onPause={() => { setSpeaking(false); recordDiagnostic("Speech audio: paused"); }}
          onWaiting={() => recordDiagnostic("Speech audio: buffering")}
          onError={() => { setSpeaking(false); recordDiagnostic(`Speech audio: load failed (code ${audio.current?.error?.code ?? "unknown"})`); setError("Audio could not load. Tap to retry."); }} />
        {error && <p className="audio-error" role="status">{error}</p>}
        <nav className="sr-only" aria-label="Flashcard navigation"><button onClick={() => move(-1)} tabIndex={-1}>Previous card</button><button onClick={() => move(1)} tabIndex={-1}>Next card</button></nav>
    </main>;
}
