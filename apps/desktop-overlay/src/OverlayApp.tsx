import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Send, X } from 'lucide-react';
import { CollapsedOrb, type ExpansionOrigin } from './components/CollapsedOrb';
import { RichTextContent } from './lib/renderRichText';

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

export default function OverlayApp() {
  const [overlayMode, setOverlayMode] = useState<'collapsed' | 'expanded'>('collapsed');
  const [expandOrigin, setExpandOrigin] = useState<ExpansionOrigin>({ originX: 50, originY: 50 });
  const [context, setContext] = useState('Waiting for extension context');
  const [chatContextAvailable, setChatContextAvailable] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'ai',
      content:
        'SideFlow answers using your synced browser chat. Open ChatGPT, Claude, or Gemini with the extension until context appears above—then you can ask follow-ups here.',
      time: formatTime(),
    },
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [modelsState, setModelsState] = useState<ModelsState>({ models: [], selectedId: null });
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [showFloatingOrb, setShowFloatingOrb] = useState(true);

  const modelMenuListId = useId();
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuOpenRef = useRef(false);
  const prevActiveConversationIdRef = useRef<string | null>(null);
  const dragMoveRafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayModeRef = useRef<'collapsed' | 'expanded'>('collapsed');
  const streamingAiIdRef = useRef<number | null>(null);
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

  const selectedModelLabel = useMemo(() => {
    const model = modelsState.models.find((item) => item.id === modelsState.selectedId);
    return model?.label ?? 'No model connected';
  }, [modelsState.models, modelsState.selectedId]);

  useEffect(() => {
    modelMenuOpenRef.current = modelMenuOpen;
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = modelMenuRef.current;
      if (el && !el.contains(e.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [modelMenuOpen]);

  useEffect(() => {
    overlayModeRef.current = overlayMode;
    document.documentElement.dataset.sideflowUi = overlayMode;
  }, [overlayMode]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    if (window.electronAPI?.onContextUpdate) {
      cleanups.push(
        window.electronAPI.onContextUpdate((data) => {
          setContext(data.label);
          setChatContextAvailable(data.chatAvailable);
          if (data.activeConversationId !== undefined) {
            setActiveConversationId(data.activeConversationId ?? null);
          }
        }),
      );
    }
    if (window.electronAPI?.getDesktopState) {
      void window.electronAPI.getDesktopState().then((s) => {
        if (s?.preferences) setShowFloatingOrb(s.preferences.showFloatingOrb !== false);
      });
    }
    if (window.electronAPI?.onDesktopState) {
      cleanups.push(
        window.electronAPI.onDesktopState((s) => {
          if (s.preferences) setShowFloatingOrb(s.preferences.showFloatingOrb !== false);
        }),
      );
    }
    const modelsPromise = window.electronAPI?.getModelsState?.();
    if (modelsPromise) {
      void modelsPromise.then((state) => {
        if (state) setModelsState(state);
      });
    }
    if (window.electronAPI?.onModelsState) {
      cleanups.push(window.electronAPI.onModelsState((state) => setModelsState(state)));
    }
    if (window.electronAPI?.onFocusInput) {
      cleanups.push(window.electronAPI.onFocusInput(() => window.setTimeout(() => inputRef.current?.focus(), 0)));
    }
    if (window.electronAPI?.onOverlayMode) {
      cleanups.push(
        window.electronAPI.onOverlayMode(async (mode) => {
          if (mode === 'expanded') {
            const expansion = await window.electronAPI?.getExpansionInfo?.();
            if (expansion) setExpandOrigin({ originX: expansion.originX, originY: expansion.originY });
          }
          setOverlayMode(mode);
        }),
      );
    }
    if (window.electronAPI?.onOverlayBoundsChanged) {
      cleanups.push(
        window.electronAPI.onOverlayBoundsChanged(() => {
          requestAnimationFrame(() => {
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

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modelMenuOpenRef.current) {
        setModelMenuOpen(false);
        return;
      }
      if (e.key === 'Escape' && overlayModeRef.current === 'expanded') {
        setOverlayMode('collapsed');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      for (const cleanup of cleanups) cleanup();
      window.removeEventListener('keydown', onKey);
      if (dragMoveRafRef.current != null) cancelAnimationFrame(dragMoveRafRef.current);
    };
  }, []);

  useEffect(() => {
    const prev = prevActiveConversationIdRef.current;
    if (prev !== null && activeConversationId !== null && prev !== activeConversationId) {
      setMessages([
        {
          id: uid(),
          role: 'ai',
          content:
            'Context switched — new browser chat detected. Ask a question about this conversation.',
          time: formatTime(),
        },
      ]);
      setInput('');
      setIsStreaming(false);
      streamingAiIdRef.current = null;
    }
    prevActiveConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!isStreaming) return;
    const idAtStart = streamingAiIdRef.current;
    const timeoutId = window.setTimeout(() => {
      if (streamingAiIdRef.current !== idAtStart) return;
      streamingAiIdRef.current = null;
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === idAtStart
            ? {
                ...m,
                content:
                  m.content ||
                  'Timed out waiting for the assistant. Check your connection and API settings, then try again.',
                streaming: false,
              }
            : m,
        ),
      );
    }, 60_000);
    return () => window.clearTimeout(timeoutId);
  }, [isStreaming]);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
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

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (window.electronAPI?.onAssistantChunk) {
      cleanups.push(
        window.electronAPI.onAssistantChunk((data) => {
          const aiId = streamingAiIdRef.current;
          if (aiId == null || !data.text) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + data.text } : m)),
          );
        }),
      );
    }

    if (window.electronAPI?.onAssistantDone) {
      cleanups.push(
        window.electronAPI.onAssistantDone(() => {
          const aiId = streamingAiIdRef.current;
          if (aiId != null) {
            setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)));
          }
          streamingAiIdRef.current = null;
          setIsStreaming(false);
        }),
      );
    }

    if (window.electronAPI?.onAssistantError) {
      cleanups.push(
        window.electronAPI.onAssistantError((data) => {
          const aiId = streamingAiIdRef.current;
          if (aiId != null) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, content: m.content || `Error: ${data.error}`, streaming: false } : m,
              ),
            );
          }
          streamingAiIdRef.current = null;
          setIsStreaming(false);
        }),
      );
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  const handleSend = useCallback(async () => {
    const val = input.trim();
    if (!val || isStreaming || !chatContextAvailable) return;

    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }

    const userId = uid();
    const aiId = uid();
    streamingAiIdRef.current = aiId;

    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: val, time: formatTime() },
      { id: aiId, role: 'ai', content: '', time: formatTime(), streaming: true },
    ]);
    setIsStreaming(true);

    try {
      const result = await window.electronAPI?.askAssistant?.({ question: val });
      if (result && !result.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, content: result.content, streaming: false } : m)),
        );
        streamingAiIdRef.current = null;
        setIsStreaming(false);
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, content: 'Failed to contact desktop assistant.', streaming: false } : m,
        ),
      );
      streamingAiIdRef.current = null;
      setIsStreaming(false);
    }
  }, [input, isStreaming, chatContextAvailable]);

  const handleStartDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (overlayMode === 'expanded') {
      const target = e.target as HTMLElement;
      if (target.closest('button, textarea, a, input')) return;
      if (target.closest('[data-message-bubble]')) return;
      if (target.closest('[data-no-window-drag]')) return;
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
      captureTarget: e.target as EventTarget & { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void },
    };
    draggingRef.current.captureTarget?.setPointerCapture?.(e.pointerId);
  }, [overlayMode]);

  const flushPendingMove = useCallback(() => {
    dragMoveRafRef.current = null;
    const p = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (!p) return;
    void window.electronAPI?.moveOverlay?.(p.x, p.y);
  }, []);

  const handleMoveDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const deltaX = e.screenX - drag.startScreenX;
      const deltaY = e.screenY - drag.startScreenY;
      if (!drag.didMove && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
        drag.didMove = true;
      }
      pendingMoveRef.current = {
        x: drag.startWindowX + deltaX,
        y: drag.startWindowY + deltaY,
      };
      if (dragMoveRafRef.current == null) {
        dragMoveRafRef.current = requestAnimationFrame(flushPendingMove);
      }
    },
    [flushPendingMove],
  );

  const handleEndDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (dragMoveRafRef.current != null) {
      cancelAnimationFrame(dragMoveRafRef.current);
      dragMoveRafRef.current = null;
    }
    const p = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (p) {
      void window.electronAPI?.moveOverlay?.(p.x, p.y);
    }
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
        <CollapsedOrb
          onExpandComplete={(info) => {
            setExpandOrigin(info);
            setOverlayMode('expanded');
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="cloud-panel h-full w-full overflow-hidden rounded-[var(--sf-radius-panel)] bg-transparent"
      style={{ transformOrigin: `${expandOrigin.originX}% ${expandOrigin.originY}%` }}
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
      <div className="glass-shadow-stack relative h-full w-full overflow-hidden rounded-[var(--sf-radius-panel)]">
        <div className="pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] bg-[linear-gradient(145deg,var(--sf-surface-1),var(--sf-surface-2))]" />
        <div className="liquid-layer pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--sf-radius-panel)]">
          <div className="absolute -left-20 -top-24 h-[300px] w-[300px] rounded-full bg-gradient-to-br from-cyan-300/14 via-blue-400/10 to-indigo-900/5 blur-[72px] animate-fluid-mesh animate-drift-slower bg-[length:200%_200%] liquid-blob-screen" />
          <div className="absolute -bottom-28 right-[-72px] h-[320px] w-[320px] rounded-full bg-gradient-to-br from-blue-200/10 via-sky-300/8 to-indigo-900/5 blur-[78px] animate-fluid-mesh animate-drift-reverse bg-[length:205%_205%] liquid-blob-soft" />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] bg-white/[0.06] backdrop-blur-[var(--sf-blur-panel)] saturate-[120%]" />
        <div className="glass-reflect-top pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] opacity-70 animate-glass-sheen" />
        <div className="pointer-events-none absolute inset-0 rounded-[var(--sf-radius-panel)] border border-white/20" />

        <div className="relative z-10 flex h-full flex-col text-white">
          <header className="relative flex select-none items-center gap-3 px-5 pb-3 pt-4">
            <div className="relative z-0 flex min-h-[40px] min-w-0 flex-1 items-center gap-3">
              <div className="text-[12px] font-semibold tracking-[0.2em] text-[color:var(--sf-text-2)]">SIDEFLOW</div>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--sf-accent-c)] animate-pulse" />
            </div>

            <div className="relative z-20 shrink-0">
              <button
                type="button"
                className="ring-focus-soft grid h-8 w-8 place-items-center rounded-full border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] text-[color:var(--sf-text-2)] transition-all duration-200 ease-out hover:border-white/25 hover:bg-white/15 hover:text-[color:var(--sf-text)]"
                aria-label="Close SideFlow panel"
                title="Close"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return;
                  setOverlayMode('collapsed');
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOverlayMode('collapsed');
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

          <div ref={scrollRef} className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-3 pt-2">
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
                          <RichTextContent content={m.content} />
                          {m.streaming ? <span className="ml-0.5 inline-block h-[14px] w-[2px] align-middle bg-[color:var(--sf-text-2)] animate-pulse" /> : null}
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
                disabled={isStreaming || !chatContextAvailable}
                placeholder={chatContextAvailable ? 'Ask…' : 'Sync a browser chat first…'}
                className="scrollbar-hide max-h-[72px] min-h-[18px] flex-1 resize-none bg-transparent py-1.5 pl-0 pr-1 text-[12px] leading-[1.45] text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] focus:outline-none disabled:opacity-60"
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize(e.currentTarget);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />

              <button
                type="button"
                className="ring-focus-soft mb-px grid h-8 w-8 shrink-0 place-items-center rounded-full border border-blue-100/28 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] text-white shadow-[var(--sf-shadow-soft)] transition-all duration-200 ease-out hover:brightness-110 active:scale-[0.96] disabled:scale-100 disabled:opacity-40 disabled:hover:brightness-100"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming || !chatContextAvailable}
                title={chatContextAvailable ? 'Send' : 'Sync chat context first'}
              >
                <Send size={14} strokeWidth={2.25} />
              </button>
            </div>

            <div data-no-window-drag className="mt-1.5 flex min-h-[18px] items-center justify-between gap-2">
              <div className="min-w-0 flex-1 text-[10px] leading-tight text-[color:var(--sf-muted)]">
                {showFloatingOrb ? (
                  <>
                    <span className="mr-3 inline">
                      <span className="rounded border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-1.5 py-0.5">Ctrl+Q</span> toggle
                    </span>
                    <span className="inline">
                      <span className="rounded border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-1.5 py-0.5">Esc</span> hide
                    </span>
                  </>
                ) : (
                  <>
                    <span className="mr-3 inline">
                      <span className="rounded border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-1.5 py-0.5">Ctrl+Q</span> close
                    </span>
                    <span className="inline">
                      <span className="rounded border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] px-1.5 py-0.5">Esc</span> hide
                    </span>
                  </>
                )}
              </div>

              <div ref={modelMenuRef} className="relative z-20 shrink-0">
                <button
                  type="button"
                  disabled={modelsState.models.length === 0}
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  aria-controls={modelMenuListId}
                  className="inline-flex max-w-[min(200px,46vw)] items-center gap-0.5 rounded-md border border-white/12 bg-black/15 px-1.5 py-0.5 text-left text-[9px] font-medium leading-tight text-[color:var(--sf-text-2)] shadow-none backdrop-blur-sm transition-[border-color,background-color] duration-150 hover:border-white/18 hover:bg-black/22 disabled:cursor-default disabled:opacity-50"
                  onClick={() => {
                    if (modelsState.models.length === 0) return;
                    setModelMenuOpen((open) => !open);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return;
                    if (modelsState.models.length === 0) return;
                    if (e.key === 'ArrowDown' && !modelMenuOpen) {
                      e.preventDefault();
                      setModelMenuOpen(true);
                    }
                  }}
                  title={selectedModelLabel}
                >
                  <span className="min-w-0 truncate tracking-wide">{selectedModelLabel}</span>
                  <ChevronDown size={10} className={`shrink-0 opacity-70 transition-transform duration-200 ${modelMenuOpen ? 'rotate-180' : ''}`} strokeWidth={2.25} />
                </button>

                {modelMenuOpen && modelsState.models.length > 0 ? (
                  <div
                    id={modelMenuListId}
                    className="absolute bottom-full right-0 z-40 mb-0.5 max-h-[min(180px,38vh)] w-max min-w-[7.5rem] max-w-[min(240px,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-1)]/96 py-0.5 shadow-[var(--sf-shadow-soft)] backdrop-blur-md scrollbar-hide"
                    role="listbox"
                    tabIndex={-1}
                    onKeyDown={(e) => {
                      const opts = modelsState.models;
                      const i = opts.findIndex((m) => m.id === modelsState.selectedId);
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = opts[Math.min(i + 1, opts.length - 1)];
                        if (next) window.electronAPI?.setSelectedModel?.(next.id);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const next = opts[Math.max(i - 1, 0)];
                        if (next) window.electronAPI?.setSelectedModel?.(next.id);
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setModelMenuOpen(false);
                      }
                    }}
                  >
                    {modelsState.models.map((model) => {
                      const active = model.id === modelsState.selectedId;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={
                            active
                              ? 'block w-full whitespace-nowrap bg-white/[0.07] px-2 py-1 text-left text-[10px] leading-snug text-[color:var(--sf-text)]'
                              : 'block w-full whitespace-nowrap px-2 py-1 text-left text-[10px] leading-snug text-[color:var(--sf-text-2)] hover:bg-white/[0.05]'
                          }
                          onClick={() => {
                            window.electronAPI?.setSelectedModel?.(model.id);
                            setModelMenuOpen(false);
                          }}
                        >
                          {model.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
