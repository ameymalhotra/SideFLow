import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { CollapsedOrb } from './components/CollapsedOrb';

type Role = 'user' | 'ai';

interface ChatMessage {
  id: number;
  role: Role;
  content: string;
  time: string;
  streaming?: boolean;
}

let nextId = 1;
const uid = () => nextId++;

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function* streamAIResponse(_messages: ChatMessage[], _context: string) {
  const reply =
    "Here’s what I’m seeing from the page context. If you paste the exact error, I can pinpoint it — but the usual fix is to avoid holding short-lived borrows across an `await`, or to move owned data into the async task.\n\nWant me to rewrite the minimal snippet with the correct lifetimes?";
  for (const char of reply) {
    yield char;
    await new Promise((r) => setTimeout(r, 12 + Math.random() * 12));
  }
}

function renderRichText(content: string) {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/i, '');
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-xl border border-[color:var(--sf-border-soft)] bg-white/10 px-4 py-3 text-[12px] leading-[1.6] text-[color:var(--sf-text-2)]"
        >
          <code className="font-mono whitespace-pre">{code}</code>
        </pre>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded-md border border-[color:var(--sf-border-soft)] bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-[color:var(--sf-text-2)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    );
  });
}

export default function App() {
  const [overlayMode, setOverlayMode] = useState<'collapsed' | 'expanded'>('collapsed');
  const [context, setContext] = useState('No context yet');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'ai',
      content: 'SIDEFLOW is ready. Ask anything — I’ll respond with a streaming reply.',
      time: formatTime(),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<number | null>(null);
  // Keep a ref that always reflects the latest overlayMode so stable callbacks read fresh state.
  const overlayModeRef = useRef<'collapsed' | 'expanded'>('collapsed');
  const isMountedRef = useRef(false);
  const draggingRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    didMove: boolean;
    captureTarget: (EventTarget & { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void }) | null;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const messageVariants = useMemo(
    () => ({
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.98 },
    }),
    [],
  );

  // Keep the ref in sync — used by stable callbacks to read latest mode without re-subscribing.
  useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  // All IPC subscriptions registered exactly once on mount.
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (window.electronAPI?.onContextUpdate) {
      cleanups.push(window.electronAPI.onContextUpdate((data) => setContext(data)));
    }

    if (window.electronAPI?.onFocusInput) {
      cleanups.push(
        window.electronAPI.onFocusInput(() => {
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }),
      );
    }

    // Used by Ctrl+Q path: main tells renderer to change mode; renderer renders then resizes.
    if (window.electronAPI?.onOverlayMode) {
      cleanups.push(window.electronAPI.onOverlayMode((mode) => {
        // #region agent log
        fetch('http://127.0.0.1:7766/ingest/e6c255ff-a11f-4996-9e70-1b932c1a6268',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a2e664'},body:JSON.stringify({sessionId:'a2e664',location:'App.tsx:onOverlayMode',message:'onOverlayMode IPC received from main',data:{mode},timestamp:Date.now(),hypothesisId:'B,D'})}).catch(()=>{});
        // #endregion
        setOverlayMode(mode);
      }));
    }

    // Only read window position on mount — never let this override renderer mode state.
    if (window.electronAPI?.onOverlayBoundsChanged) {
      cleanups.push(
        window.electronAPI.onOverlayBoundsChanged((_payload) => {
          requestAnimationFrame(() => {
            document.documentElement.getBoundingClientRect();
            const root = document.getElementById('root');
            if (!root) return;
            root.style.transform = 'translateZ(0)';
            requestAnimationFrame(() => {
              root.style.transform = '';
            });
          });
        }),
      );
    }

    // Use the ref so this handler never goes stale and never needs re-subscribing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlayModeRef.current === 'expanded') {
        setOverlayMode('collapsed');
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      for (const c of cleanups) c();
      window.removeEventListener('keydown', onKey);
    };
  }, []); // Intentionally empty — subscriptions are stable via refs.

  // Core timing fix: React paints the new content FIRST, then this effect fires and
  // tells the main process to resize the window. This eliminates the empty-window flash
  // where the window had been resized but the renderer content wasn't ready yet.
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    // #region agent log
    fetch('http://127.0.0.1:7766/ingest/e6c255ff-a11f-4996-9e70-1b932c1a6268',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a2e664'},body:JSON.stringify({sessionId:'a2e664',location:'App.tsx:postRenderEffect',message:'post-render useEffect firing — sending IPC to main',data:{overlayMode},timestamp:Date.now(),hypothesisId:'A,C'})}).catch(()=>{});
    // #endregion
    if (overlayMode === 'expanded') {
      window.electronAPI?.expandOverlay?.();
    } else {
      window.electronAPI?.collapseOverlay?.();
    }
  }, [overlayMode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 72) + 'px';
  };

  const handleSend = useCallback(
    async (text?: string) => {
      const val = (text ?? input).trim();
      if (!val || isStreaming) return;

      setInput('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.focus();
      }

      const userId = uid();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', content: val, time: formatTime() },
      ]);

      setIsStreaming(true);
      const aiId = uid();
      streamingIdRef.current = aiId;
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: 'ai', content: '', time: formatTime(), streaming: true },
      ]);

      let acc = '';
      for await (const ch of streamAIResponse([], context)) {
        if (streamingIdRef.current !== aiId) break;
        acc += ch;
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, content: acc } : m)));
      }

      setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)));
      setIsStreaming(false);
    },
    [context, input, isStreaming],
  );

  const handleClosePanel = useCallback(() => {
    setOverlayMode('collapsed');
  }, []);

  const handleExpand = useCallback(() => {
    // #region agent log
    fetch('http://127.0.0.1:7766/ingest/e6c255ff-a11f-4996-9e70-1b932c1a6268',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a2e664'},body:JSON.stringify({sessionId:'a2e664',location:'App.tsx:handleExpand',message:'handleExpand called — setOverlayMode(expanded) next',timestamp:Date.now(),hypothesisId:'A,D'})}).catch(()=>{});
    // #endregion
    setOverlayMode('expanded');
    // The post-render useEffect will call expandOverlay() after React paints the chat panel.
  }, []);

  const handleStartDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (overlayMode === 'expanded') {
      const t = e.target as HTMLElement;
      if (t.closest('button, textarea, a, input')) return;
      if (t.closest('[data-message-bubble]')) return;
      if (t.closest('[data-no-window-drag]')) return;
    } else if (overlayMode !== 'collapsed') {
      return;
    }
    draggingRef.current = {
      pointerId: e.pointerId,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startWindowX: window.screenX,
      startWindowY: window.screenY,
      didMove: false,
      captureTarget: e.target as EventTarget & {
        setPointerCapture?: (id: number) => void;
        releasePointerCapture?: (id: number) => void;
      },
    };
    draggingRef.current.captureTarget?.setPointerCapture?.(e.pointerId);
  }, [overlayMode]);

  const handleMoveDrag = useCallback(async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const deltaX = e.screenX - drag.startScreenX;
    const deltaY = e.screenY - drag.startScreenY;
    if (!drag.didMove && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
      drag.didMove = true;
    }
    const nextX = drag.startWindowX + deltaX;
    const nextY = drag.startWindowY + deltaY;
    await window.electronAPI?.moveOverlay?.(nextX, nextY);
  }, []);

  const handleEndDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    draggingRef.current = null;
    drag.captureTarget?.releasePointerCapture?.(e.pointerId);
    if (drag.didMove) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 120);
    }
    window.electronAPI?.saveOverlayPosition?.();
  }, []);

  if (overlayMode === 'collapsed') {
    return (
      <div
        className="h-full w-full bg-transparent"
        onPointerDown={handleStartDrag}
        onPointerMove={handleMoveDrag}
        onPointerUp={handleEndDrag}
        onPointerCancel={handleEndDrag}
        onClickCapture={(e) => {
          if (!suppressClickRef.current) return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <CollapsedOrb onExpandComplete={handleExpand} />
      </div>
    );
  }

  return (
    <div
      className="cloud-panel h-full w-full overflow-hidden rounded-[var(--sf-radius-panel)] bg-transparent"
      onPointerDown={handleStartDrag}
      onPointerMove={handleMoveDrag}
      onPointerUp={handleEndDrag}
      onPointerCancel={handleEndDrag}
      onClickCapture={(ev) => {
        if (!suppressClickRef.current) return;
        ev.preventDefault();
        ev.stopPropagation();
      }}
    >
      <div className="glass-shadow-stack relative h-full w-full overflow-hidden rounded-[var(--sf-radius-panel)]">
        {/* Decorative layers must not participate in hit-testing — otherwise they block drag / clicks. */}
        {/* Layer 0: base tint */}
        <div className="pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] bg-[linear-gradient(145deg,var(--sf-surface-1),var(--sf-surface-2))]" />

        {/* Layer 1: ambient blobs */}
        <div className="liquid-layer pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--sf-radius-panel)]">
          <div className="absolute -left-20 -top-24 h-[300px] w-[300px] rounded-full bg-gradient-to-br from-cyan-300/14 via-blue-400/10 to-indigo-900/5 blur-[72px] animate-fluid-mesh animate-drift-slower bg-[length:200%_200%] liquid-blob-screen" />
          <div className="absolute -bottom-28 right-[-72px] h-[320px] w-[320px] rounded-full bg-gradient-to-br from-blue-200/10 via-sky-300/8 to-indigo-900/5 blur-[78px] animate-fluid-mesh animate-drift-reverse bg-[length:205%_205%] liquid-blob-soft" />
        </div>

        {/* Layer 2: frost */}
        <div className="pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] bg-white/[0.02] backdrop-blur-[var(--sf-blur-panel)] saturate-[118%]" />

        {/* Layer 3: subtle reflection + border */}
        <div className="glass-reflect-top pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] opacity-70 animate-glass-sheen" />
        <div className="pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] border border-[color:var(--sf-border-medium)]" />

        {/* Layer 4: content */}
        <div className="relative z-10 flex h-full flex-col text-white">
          <header className="relative flex select-none items-center gap-3 px-5 pt-4 pb-3">
            <div className="relative z-0 flex min-h-[40px] min-w-0 flex-1 items-center gap-3">
              <div className="text-[12px] font-semibold tracking-[0.2em] text-[color:var(--sf-text-2)]">
                SIDEFLOW
              </div>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--sf-accent-c)] animate-pulse" />
            </div>

            <div className="relative z-20 shrink-0">
              <button
                type="button"
                className="ring-focus-soft grid h-8 w-8 place-items-center rounded-full border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] text-[color:var(--sf-text-2)] transition-all duration-200 ease-out hover:border-white/25 hover:bg-white/15 hover:text-[color:var(--sf-text)]"
                title="Close"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return;
                  handleClosePanel();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClosePanel();
                }}
              >
                <X size={14} />
              </button>
            </div>
          </header>

          <div className="px-5 pb-2">
            <div
              data-no-window-drag
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-3 py-1.5 text-[11px] text-[color:var(--sf-text-2)]"
              title={context}
            >
              <span className="shrink-0 uppercase tracking-[0.12em] text-[color:var(--sf-muted)]">Context</span>
              <span className="truncate text-[color:var(--sf-text-2)]">{context}</span>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="scrollbar-hide flex-1 overflow-y-auto px-5 pt-2 pb-3"
          >
            <AnimatePresence initial={false}>
              <div className="flex flex-col gap-3">
                {messages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <motion.div
                      key={m.id}
                      data-message-bubble
                      variants={messageVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className={isUser ? 'flex justify-end' : 'flex justify-start'}
                    >
                      <div className="max-w-[78%]">
                        <div
                          className={
                            isUser
                              ? 'rounded-[var(--sf-radius-bubble)] border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.86),rgba(127,147,255,0.82))] px-4 py-2.5 text-[13px] leading-relaxed text-white shadow-[var(--sf-shadow-soft)]'
                              : 'rounded-[var(--sf-radius-bubble)] border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-4 py-2.5 text-[13px] leading-relaxed text-[color:var(--sf-text)]'
                          }
                        >
                          {renderRichText(m.content)}
                          {m.streaming ? (
                            <span className="ml-0.5 inline-block h-[14px] w-[2px] align-middle bg-[color:var(--sf-text-2)] animate-pulse" />
                          ) : null}
                        </div>
                        <div className={isUser ? 'mt-1 text-right text-[10px] text-[color:var(--sf-muted)]' : 'mt-1 text-[10px] text-[color:var(--sf-muted)]'}>
                          {m.time}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
          </div>

          <div className="relative z-10 px-5 pb-4">
            <div
              data-no-window-drag
              className="flex items-end gap-1.5 rounded-full border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] py-1 pl-3.5 pr-1 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)] transition-[box-shadow,border-color] duration-200 ease-out focus-within:border-white/22 focus-within:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.2),0_0_0_3px_rgba(121,182,255,0.14)]"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                disabled={isStreaming}
                placeholder="Ask…"
                className="scrollbar-hide max-h-[72px] min-h-[18px] flex-1 resize-none bg-transparent py-1.5 pl-0 pr-1 text-[12px] leading-[1.45] text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] focus:outline-none disabled:opacity-60"
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize(e.currentTarget);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />

              <button
                type="button"
                className="ring-focus-soft mb-px grid h-8 w-8 shrink-0 place-items-center rounded-full border border-blue-100/28 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] text-white shadow-[var(--sf-shadow-soft)] transition-all duration-200 ease-out hover:brightness-110 active:scale-[0.96] disabled:scale-100 disabled:opacity-40 disabled:hover:brightness-100"
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                title="Send"
              >
                <Send size={14} strokeWidth={2.25} />
              </button>
            </div>

            <div className="mt-2 text-[10px] text-[color:var(--sf-muted)]">
              <span className="mr-3">
                <span className="rounded border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-1.5 py-0.5">Ctrl+Q</span>{' '}
                toggle
              </span>
              <span>
                <span className="rounded border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-1.5 py-0.5">Esc</span>{' '}
                hide
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
