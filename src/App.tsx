import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const STORAGE_KEY = 'kt-ptc-queue';
const SESSION_MIN = 10;

type QueueEntry = { id: string; name: string };
function makeEntry(name: string): QueueEntry {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name };
}

// ─── helpers ────────────────────────────────────────────────────
function fmt12h(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** ETA for the person at queue index `i` (0 = Up Now, 1 = Next Up, …) */
function calcETA(index: number, now: Date, sessionStart: number): string {
  const elapsedMin = (now.getTime() - sessionStart) / 60_000;
  const remainingMin = Math.max(0, SESSION_MIN - elapsedMin);
  const waitMin = remainingMin + Math.max(0, index - 1) * SESSION_MIN;
  return fmt12h(new Date(now.getTime() + waitMin * 60_000));
}

// ─── hooks ──────────────────────────────────────────────────────
function useQueue() {
  const [queue, setQueue] = useState<QueueEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }, [queue]);
  const add      = useCallback((name: string) => setQueue(q => [...q, makeEntry(name)]), []);
  const callNext = useCallback(() => setQueue(q => q.slice(1)), []);
  const removeAt = useCallback((i: number) => setQueue(q => q.filter((_, idx) => idx !== i)), []);
  const clear    = useCallback(() => setQueue([]), []);
  return { queue, add, callNext, removeAt, clear };
}

// Header clock — updates every second for a live display
function useClock() {
  const [display, setDisplay] = useState(() => fmt12h(new Date()));
  useEffect(() => {
    const id = setInterval(() => setDisplay(fmt12h(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return display;
}

// ETA base time — updates every 5 minutes so estimated times stay current
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return { toast, show };
}

// ─── component ──────────────────────────────────────────────────
export default function App() {
  const { queue, add, callNext, removeAt, clear } = useQueue();
  const clockDisplay = useClock();
  const now = useNow();
  const { toast, show: showToast } = useToast();

  const [input, setInput] = useState('');
  const [displayMode, setDisplayMode] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [upNowKey, setUpNowKey] = useState(0);
  // tracks when the current "Up Now" session started (resets on each callNext)
  const [sessionStart, setSessionStart] = useState<number>(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const upNow   = queue[0]?.name ?? null;
  const nextUp  = queue[1]?.name ?? null;
  const waiting = queue.slice(2);

  function handleAdd() {
    const name = input.trim();
    if (!name) return;
    add(name);
    setInput('');
    inputRef.current?.focus();
    showToast(`${name} added to queue`);
  }

  function handleCallNext() {
    if (!upNow) return;
    setSessionStart(Date.now());
    setUpNowKey(k => k + 1);
    callNext();
    showToast(`${upNow} — called up!`);
  }

  function handleRemove(index: number) {
    const name = queue[index]?.name;
    removeAt(index);
    showToast(`${name} removed`);
  }

  function handleClearConfirm() {
    clear();
    setClearConfirm(false);
    setSessionStart(Date.now());
    showToast('Queue cleared');
  }

  return (
    <div className={`app${displayMode ? ' display-mode' : ''}`}>

      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <img src="/kt-logo.png" alt="Khan's Tutorial" className="kt-logo-img" />
        </div>

        <div className="header-title">Khan's Tutorial OP PTC</div>

        <div className="header-right">
          <span className="clock">{clockDisplay}</span>
          {displayMode && (
            <button
              className="btn-call-next-display"
              onClick={handleCallNext}
              disabled={queue.length === 0}
            >
              ▶ Call Next
            </button>
          )}
          <button
            className={`btn-mode${displayMode ? ' active' : ''}`}
            onClick={() => { setDisplayMode(d => !d); setClearConfirm(false); }}
            title={displayMode ? 'Exit Display Mode' : 'Display Mode'}
            aria-label={displayMode ? 'Exit Display Mode' : 'Display Mode'}
          >
            {displayMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"/>
                <path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"/>
                <path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="app-body">

        {/* Admin Panel */}
        <aside className={`admin-panel${displayMode ? ' hidden' : ''}`} aria-hidden={displayMode}>
          <div className="admin-inner">

            {/* Add form */}
            <section className="admin-section">
              <div className="section-label">Add to Queue</div>
              <div className="add-box">
                <div className="add-row">
                  <input
                    ref={inputRef}
                    className="name-input"
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="Enter student's name…"
                    maxLength={60}
                    autoComplete="off"
                  />
                  <button className="btn-add" onClick={handleAdd} title="Add">+</button>
                </div>
              </div>
            </section>

            {/* Queue list */}
            <section className="admin-section queue-section">
              <div className="section-label">
                Queue
                {queue.length > 0 && <span className="queue-count">{queue.length}</span>}
              </div>
              <ul className="queue-list">
                {queue.length === 0 ? (
                  <li className="queue-empty">Queue is empty</li>
                ) : (
                  queue.map((entry, i) => (
                    <li key={entry.id} className={`queue-item${i === 0 ? ' item-current' : ''}`}>
                      <span className={`item-pos${i === 0 ? ' pos-now' : ''}`}>
                        {i === 0 ? 'NOW' : i + 1}
                      </span>
                      <span className="item-name" title={entry.name}>{entry.name}</span>
                      {i > 0 && (
                        <span className="item-eta">{calcETA(i, now, sessionStart)}</span>
                      )}
                      <button
                        className="btn-remove"
                        onClick={() => handleRemove(i)}
                        title={`Remove ${entry.name}`}
                      >×</button>
                    </li>
                  ))
                )}
              </ul>
            </section>

            {/* Actions */}
            <section className="admin-section admin-actions">
              <button
                className="btn-call-next"
                onClick={handleCallNext}
                disabled={queue.length === 0}
              >
                ▶ Call Next
              </button>

              <div className="btn-clear-row">
                {clearConfirm ? (
                  <>
                    <button className="btn-clear-confirm" onClick={handleClearConfirm}>
                      Confirm Clear
                    </button>
                    <button className="btn-cancel" onClick={() => setClearConfirm(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-clear-all"
                    onClick={() => setClearConfirm(true)}
                    disabled={queue.length === 0}
                    style={{ opacity: queue.length === 0 ? 0.35 : 1, cursor: queue.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </section>

          </div>
        </aside>

        {/* Display Panel */}
        <main className="display-panel">
          <div className="display-inner">

            {/* Up Now */}
            <div className="up-now-card">
              <div className="card-eyebrow">— Up Now —</div>
              <div key={upNowKey} className={`up-now-name${!upNow ? ' empty' : ''}`}>
                {upNow ?? 'Queue is empty'}
              </div>
            </div>

            {/* Next Up */}
            <div className="next-up-row">
              <span className="next-label">Next Up</span>
              <div className="next-divider" />
              <span className={`next-name${!nextUp ? ' empty' : ''}`}>
                {nextUp ?? '—'}
              </span>
              {nextUp && (
                <span className="next-eta">{calcETA(1, now, sessionStart)}</span>
              )}
            </div>

            {/* Waiting */}
            <div className="waiting-section">
              <div className="waiting-header">
                <span className="waiting-label">Waiting</span>
                {waiting.length > 0 && <span className="waiting-badge">{waiting.length}</span>}
              </div>
              <div className="waiting-list-display">
                {waiting.length === 0 ? (
                  <span className="no-waiting">No one else in queue</span>
                ) : (
                  waiting.map((entry, i) => (
                    <div key={entry.id} className={`waiting-row${i >= 3 ? ' row-small' : ''}`}>
                      <span className="row-num">{i + 3}</span>
                      <span className="row-name">{entry.name}</span>
                      <span className="row-eta">{calcETA(i + 2, now, sessionStart)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </main>

      </div>

      {/* Toast */}
      <div className={`toast${toast ? ' toast-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>

    </div>
  );
}
