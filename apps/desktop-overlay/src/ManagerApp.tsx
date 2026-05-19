import { useCallback, useEffect, useMemo, useState } from 'react';
import { Orbit, Settings, Trash2 } from 'lucide-react';
import { RichTextContent } from './lib/renderRichText';
import { DEFAULT_DESKTOP_STATE } from './lib/desktop-defaults';
import { formatTimestamp } from './lib/format';
import { MainAppSidebar } from './components/manager/MainAppSidebar';
import { Onboarding } from './components/manager/Onboarding';
import type { TabId } from './components/manager/types';

type SelectedDetail = { kind: 'synced' | 'sideflow'; id: string | null };

export default function ManagerApp() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [chatMode, setChatMode] = useState<'synced' | 'sideflow'>('synced');
  const [desktopState, setDesktopState] = useState<DesktopState>(DEFAULT_DESKTOP_STATE);
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail>({
    kind: 'synced',
    id: null,
  });
  const [providerId, setProviderId] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [modelProviderId, setModelProviderId] = useState('openai');
  const [modelId, setModelId] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [userError, setUserError] = useState<string | null>(null);

  const reportError = useCallback((label: string, err: unknown) => {
    console.error(label, err);
    setUserError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }, []);

  const activeConversation = useMemo(
    () =>
      desktopState.conversations.find((item) => item.id === desktopState.activeConversationId) ??
      desktopState.conversations[0] ??
      null,
    [desktopState.activeConversationId, desktopState.conversations],
  );

  const activeSideflowChat = useMemo(
    () => desktopState.sideflowChats.find((item) => item.id === selectedDetail.id) ?? desktopState.sideflowChats[0] ?? null,
    [desktopState.sideflowChats, selectedDetail.id],
  );

  const activeModel = useMemo(
    () =>
      desktopState.connectedModels.find((m) => m.id === desktopState.selectedModelId) ??
      desktopState.connectedModels[0] ??
      null,
    [desktopState.connectedModels, desktopState.selectedModelId],
  );

  const lastSideflowChat = useMemo(
    () => desktopState.sideflowChats[0] ?? null,
    [desktopState.sideflowChats],
  );

  useEffect(() => {
    document.documentElement.dataset.sideflowUi = 'manager';
    const cleanups: Array<() => void> = [];
    if (window.electronAPI?.onDesktopState) {
      cleanups.push(window.electronAPI.onDesktopState((state) => setDesktopState(state)));
    }
    if (window.electronAPI?.getDesktopState) {
      void window.electronAPI.getDesktopState().then((state) => setDesktopState(state));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  useEffect(() => {
    if (selectedDetail.kind !== chatMode) {
      setSelectedDetail((current) => ({ ...current, kind: chatMode }));
    }
  }, [chatMode, selectedDetail.kind]);

  useEffect(() => {
    if (selectedDetail.kind === 'synced') {
      const fallbackId = activeConversation?.id ?? null;
      if (selectedDetail.id == null || !desktopState.conversations.some((item) => item.id === selectedDetail.id)) {
        setSelectedDetail({ kind: 'synced', id: fallbackId });
      }
      return;
    }
    const fallbackId = desktopState.sideflowChats[0]?.id ?? null;
    if (selectedDetail.id == null || !desktopState.sideflowChats.some((item) => item.id === selectedDetail.id)) {
      setSelectedDetail({ kind: 'sideflow', id: fallbackId });
    }
  }, [activeConversation?.id, desktopState.conversations, desktopState.sideflowChats, selectedDetail.id, selectedDetail.kind]);

  const statusTone = desktopState.extension.connected
    ? 'bg-emerald-300/80'
    : desktopState.extension.lastError
      ? 'bg-rose-300/80'
      : 'bg-amber-200/80';

  const launchOrbButtonLabel = desktopState.preferences?.showFloatingOrb !== false ? 'Focus Orb' : 'Open chat';

  const setupChecks = {
    extensionConnected: desktopState.extension.connected,
    hasProviderKey: desktopState.providers.some((provider) => provider.keyConfigured),
    hasModel: desktopState.connectedModels.length > 0,
  };

  /* ------------------------------------------------------------------ */
  /*  Onboarding wizard                                                 */
  /* ------------------------------------------------------------------ */
  if (!desktopState.onboarding.completed) {
    return (
      <Onboarding
        desktopState={desktopState}
        setDesktopState={setDesktopState}
        reportError={reportError}
      />
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Main app (post-onboarding)                                        */
  /* ------------------------------------------------------------------ */
  return (
    <div className="manager-shell h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(121,182,255,0.18),transparent_28%),linear-gradient(180deg,#0d1422,#0a111d)] text-white">
      <div className="mx-auto flex h-full max-w-[1440px] flex-col px-6 py-6">
        <header className="flex shrink-0 items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.05] px-6 py-5 shadow-[var(--sf-shadow-soft)]">
          <div>
            <div className="text-[12px] font-semibold tracking-[0.24em] text-[color:var(--sf-text-2)]">SIDEFLOW DESKTOP</div>
            <div className="mt-2 max-w-[720px] text-[14px] text-[color:var(--sf-text-2)]">
              Manage providers, API keys, synced chats, and extension health here. The orb remains a separate overlay for chat.
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] px-4 py-2 text-[13px] text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
            onClick={() => void window.electronAPI?.launchOrb?.()}
          >
            <Orbit size={15} />
            {launchOrbButtonLabel}
          </button>
        </header>

        {userError ? (
          <div
            role="alert"
            className="mt-3 flex shrink-0 items-start justify-between gap-3 rounded-2xl border border-rose-400/35 bg-rose-500/15 px-4 py-3 text-[13px] text-rose-100"
          >
            <span className="min-w-0 flex-1 leading-snug">{userError}</span>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[12px] text-white/90 hover:bg-white/10"
              onClick={() => setUserError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-5 pt-5">
          <MainAppSidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            statusTone={statusTone}
            desktopState={desktopState}
          />

          {/* Main content area */}
          <main className="min-h-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[var(--sf-shadow-soft)]">
            {/* ============================================================ */}
            {/*  HOME TAB                                                    */}
            {/* ============================================================ */}
            {activeTab === 'home' ? (
              <div className="flex h-full flex-col gap-5 overflow-y-auto sf-scrollbar pr-1">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Dashboard</div>
                  <h2 className="mt-2 text-[22px] font-semibold text-white">Overview</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {/* Extension card */}
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-3 w-3 rounded-full ${statusTone}`} />
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">Extension</div>
                    </div>
                    <div className="mt-3 text-[20px] font-medium text-white">
                      {desktopState.extension.connected ? 'Connected' : 'Disconnected'}
                    </div>
                    <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                      Last seen: {formatTimestamp(desktopState.extension.lastSeenAt)}
                    </div>
                  </div>

                  {/* Active model card */}
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[12px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">Active model</div>
                    {activeModel ? (
                      <>
                        <div className="mt-3 truncate text-[20px] font-medium text-white">{activeModel.label}</div>
                        <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                          {activeModel.providerLabel ?? activeModel.providerId ?? 'Provider'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mt-3 text-[20px] font-medium text-[color:var(--sf-text-2)]">None</div>
                        <button
                          type="button"
                          className="mt-2 text-[12px] text-blue-300/80 hover:text-blue-200"
                          onClick={() => setActiveTab('settings')}
                        >
                          Configure in Settings
                        </button>
                      </>
                    )}
                  </div>

                  {/* Synced chats card */}
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[12px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">Synced chats</div>
                    <div className="mt-3 text-[20px] font-medium text-white">{desktopState.conversations.length}</div>
                    <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                      {desktopState.conversations.length > 0
                        ? `Latest: ${desktopState.conversations[0]?.site.toUpperCase()}`
                        : 'No conversations synced yet'}
                    </div>
                  </div>

                  {/* Recent activity card */}
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[12px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">Recent activity</div>
                    {lastSideflowChat ? (
                      <>
                        <div className="mt-3 line-clamp-1 text-[14px] font-medium text-white">{lastSideflowChat.title}</div>
                        <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                          {formatTimestamp(lastSideflowChat.updatedAt)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mt-3 text-[14px] font-medium text-[color:var(--sf-text-2)]">No activity yet</div>
                        <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                          Ask something from the orb to get started
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2.5 text-[13px] text-[color:var(--sf-text-2)] transition-colors hover:bg-white/[0.1]"
                    onClick={() => setActiveTab('settings')}
                  >
                    <Settings size={14} />
                    Open Settings
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] px-4 py-2.5 text-[13px] text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                    onClick={() => void window.electronAPI?.launchOrb?.()}
                  >
                    <Orbit size={14} />
                    {launchOrbButtonLabel}
                  </button>
                </div>

                {/* Setup checklist (only if something is missing) */}
                {(!setupChecks.hasProviderKey || !setupChecks.hasModel || !setupChecks.extensionConnected) ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[13px] font-medium text-white">Setup checklist</div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${setupChecks.hasProviderKey ? 'border border-emerald-300/30 bg-emerald-400/20 text-emerald-200' : 'border border-white/12 bg-white/[0.06] text-[color:var(--sf-text-2)]'}`}>
                          {setupChecks.hasProviderKey ? '\u2713' : '1'}
                        </div>
                        <div className={`text-[13px] ${setupChecks.hasProviderKey ? 'text-[color:var(--sf-text-2)] line-through' : 'text-white'}`}>
                          Add a provider API key
                        </div>
                        {!setupChecks.hasProviderKey ? (
                          <button type="button" className="ml-auto text-[12px] text-blue-300/80 hover:text-blue-200" onClick={() => setActiveTab('settings')}>
                            Go to Settings
                          </button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${setupChecks.hasModel ? 'border border-emerald-300/30 bg-emerald-400/20 text-emerald-200' : 'border border-white/12 bg-white/[0.06] text-[color:var(--sf-text-2)]'}`}>
                          {setupChecks.hasModel ? '\u2713' : '2'}
                        </div>
                        <div className={`text-[13px] ${setupChecks.hasModel ? 'text-[color:var(--sf-text-2)] line-through' : 'text-white'}`}>
                          Connect a model
                        </div>
                        {!setupChecks.hasModel ? (
                          <button type="button" className="ml-auto text-[12px] text-blue-300/80 hover:text-blue-200" onClick={() => setActiveTab('settings')}>
                            Go to Settings
                          </button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${setupChecks.extensionConnected ? 'border border-emerald-300/30 bg-emerald-400/20 text-emerald-200' : 'border border-white/12 bg-white/[0.06] text-[color:var(--sf-text-2)]'}`}>
                          {setupChecks.extensionConnected ? '\u2713' : '3'}
                        </div>
                        <div className={`text-[13px] ${setupChecks.extensionConnected ? 'text-[color:var(--sf-text-2)] line-through' : 'text-white'}`}>
                          Connect the browser extension
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ============================================================ */}
            {/*  CHATS TAB (unchanged)                                       */}
            {/* ============================================================ */}
            {activeTab === 'chats' ? (
              <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)] gap-4">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
                  <div className="px-2 pb-3 pt-2">
                    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.05] p-1">
                      <button
                        type="button"
                        className={
                          chatMode === 'synced'
                            ? 'rounded-full bg-white/[0.12] px-4 py-2 text-[12px] font-medium text-white'
                            : 'rounded-full px-4 py-2 text-[12px] font-medium text-[color:var(--sf-text-2)] hover:bg-white/[0.06]'
                        }
                        onClick={() => setChatMode('synced')}
                      >
                        Synced chats
                      </button>
                      <button
                        type="button"
                        className={
                          chatMode === 'sideflow'
                            ? 'rounded-full bg-white/[0.12] px-4 py-2 text-[12px] font-medium text-white'
                            : 'rounded-full px-4 py-2 text-[12px] font-medium text-[color:var(--sf-text-2)] hover:bg-white/[0.06]'
                        }
                        onClick={() => setChatMode('sideflow')}
                      >
                        Chats with SideFlow
                      </button>
                    </div>
                  </div>

                  <div className="sf-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-1 pr-2">
                    {chatMode === 'synced' ? (
                      desktopState.conversations.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-[13px] text-[color:var(--sf-text-2)]">
                          No synced chats yet. Keep the desktop app open, then browse with the extension enabled.
                        </div>
                      ) : (
                        desktopState.conversations.map((conversation) => {
                          const active = selectedDetail.kind === 'synced' && conversation.id === selectedDetail.id;
                          return (
                            <button
                              key={conversation.id}
                              type="button"
                              className={
                                active
                                  ? 'block w-full rounded-2xl border border-white/16 bg-white/[0.09] px-4 py-3 text-left'
                                  : 'block w-full rounded-2xl border border-transparent bg-white/[0.03] px-4 py-3 text-left hover:border-white/10 hover:bg-white/[0.07]'
                              }
                              onClick={async () => {
                                try {
                                  const nextState = await window.electronAPI?.setActiveConversation?.(conversation.id);
                                  if (nextState) setDesktopState(nextState);
                                  setSelectedDetail({ kind: 'synced', id: conversation.id });
                                } catch (e) {
                                  reportError('Could not select conversation', e);
                                }
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[12px] font-medium text-white">{conversation.site.toUpperCase()}</div>
                                <div className="text-[10px] text-[color:var(--sf-muted)]">{formatTimestamp(conversation.updatedAt)}</div>
                              </div>
                              <div className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                                {conversation.lastMessagePreview}
                              </div>
                              <div className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">
                                {conversation.messageCount} messages
                              </div>
                            </button>
                          );
                        })
                      )
                    ) : desktopState.sideflowChats.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-[13px] text-[color:var(--sf-text-2)]">
                        No SideFlow chats yet. Ask something from the orb and it will appear here linked to its synced source chat.
                      </div>
                    ) : (
                      desktopState.sideflowChats.map((chat) => {
                        const active = selectedDetail.kind === 'sideflow' && chat.id === selectedDetail.id;
                        return (
                          <button
                            key={chat.id}
                            type="button"
                            className={
                              active
                                ? 'block w-full rounded-2xl border border-white/16 bg-white/[0.09] px-4 py-3 text-left'
                                : 'block w-full rounded-2xl border border-transparent bg-white/[0.03] px-4 py-3 text-left hover:border-white/10 hover:bg-white/[0.07]'
                            }
                            onClick={() => setSelectedDetail({ kind: 'sideflow', id: chat.id })}
                          >
                            <div className="text-[12px] font-medium text-white">{chat.title}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">
                              Based on {chat.sourceLabel}
                            </div>
                            <div className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                              {chat.lastMessagePreview}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  {chatMode === 'sideflow' && activeSideflowChat ? (
                    <>
                      <div className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">SideFlow chat</div>
                      <div className="mt-2 text-[15px] text-[color:var(--sf-text)]">{activeSideflowChat.title}</div>
                      <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                        Based on {activeSideflowChat.sourceLabel}
                      </div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">
                        {formatTimestamp(activeSideflowChat.updatedAt)}
                      </div>
                      <div className="sf-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
                        <div className="space-y-3">
                          {activeSideflowChat.messages.map((message) => (
                            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                              <div
                                className={
                                  message.role === 'user'
                                    ? 'max-w-[78%] rounded-[18px] border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.86),rgba(127,147,255,0.82))] px-4 py-3 text-[13px] leading-relaxed text-white'
                                    : 'max-w-[78%] rounded-[18px] border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-strong)] px-4 py-3 text-[13px] leading-relaxed text-[color:var(--sf-text)]'
                                }
                              >
                                <RichTextContent content={message.content} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex shrink-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Synced conversation</div>
                          <div className="mt-2 text-[15px] text-[color:var(--sf-text)]">
                            {activeConversation ? activeConversation.site.toUpperCase() : 'No conversation selected'}
                          </div>
                        </div>
                        {activeConversation ? (
                          <button
                            type="button"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-200/18 bg-rose-300/10 text-rose-100 transition-colors hover:bg-rose-300/16"
                            title="Delete synced chat"
                            onClick={async () => {
                              const confirmed = window.confirm(
                                "Are you sure you want to delete it? This action can't be undone.",
                              );
                              if (!confirmed) return;
                              try {
                                const nextState = await window.electronAPI?.deleteConversation?.(activeConversation.id);
                                if (nextState) {
                                  setDesktopState(nextState);
                                  setSelectedDetail({
                                    kind: 'synced',
                                    id: nextState.conversations[0]?.id ?? null,
                                  });
                                }
                              } catch (e) {
                                reportError('Delete conversation failed', e);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 text-[12px] text-[color:var(--sf-text-2)]">
                        {activeConversation?.url || 'Select a captured conversation to inspect its source.'}
                      </div>
                      <div className="sf-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
                        {activeConversation ? (
                          <div className="space-y-3">
                            {activeConversation.messages.map((message) => (
                              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                <div
                                  className={
                                    message.role === 'user'
                                      ? 'max-w-[78%] rounded-[18px] border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.86),rgba(127,147,255,0.82))] px-4 py-3 text-[13px] leading-relaxed text-white'
                                      : 'max-w-[78%] rounded-[18px] border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-strong)] px-4 py-3 text-[13px] leading-relaxed text-[color:var(--sf-text)]'
                                  }
                                >
                                  <RichTextContent content={message.content} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-[13px] text-[color:var(--sf-text-2)]">
                            No synced content yet.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            ) : null}

            {/* ============================================================ */}
            {/*  SETTINGS TAB                                                */}
            {/* ============================================================ */}
            {activeTab === 'settings' ? (
              <div className="sf-scrollbar h-full space-y-6 overflow-y-auto pr-1">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Configuration</div>
                  <h2 className="mt-2 text-[22px] font-semibold text-white">Settings</h2>
                </div>

                {/* --- SideFlow chat access (orb vs shortcut) --- */}
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[13px] font-medium text-white">SideFlow chat access</div>
                  <p className="mt-2 max-w-[80ch] text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                    Choose how you open the on-screen chat. The global shortcut{' '}
                    <span className="rounded border border-white/12 bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-[color:var(--sf-text)]">
                      Ctrl+Q
                    </span>{' '}
                    (Control+Q, including on macOS) toggles the chat panel.
                  </p>
                  <div className="mt-4 space-y-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.06]">
                      <input
                        type="radio"
                        name="sideflow-chat-access"
                        className="mt-1"
                        checked={desktopState.preferences?.showFloatingOrb !== false}
                        onChange={async () => {
                          try {
                            const next = await window.electronAPI?.setPreferences?.({ showFloatingOrb: true });
                            if (next) setDesktopState(next);
                          } catch (e) {
                            reportError('Update preferences failed', e);
                          }
                        }}
                      />
                      <div>
                        <div className="text-[13px] text-white">Floating orb</div>
                        <div className="mt-1 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                          Keep the small orb on screen. Click it or use Ctrl+Q to expand the chat.
                        </div>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.06]">
                      <input
                        type="radio"
                        name="sideflow-chat-access"
                        className="mt-1"
                        checked={desktopState.preferences?.showFloatingOrb === false}
                        onChange={async () => {
                          try {
                            const next = await window.electronAPI?.setPreferences?.({ showFloatingOrb: false });
                            if (next) setDesktopState(next);
                          } catch (e) {
                            reportError('Update preferences failed', e);
                          }
                        }}
                      />
                      <div>
                        <div className="text-[13px] text-white">Keyboard shortcut only</div>
                        <div className="mt-1 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                          Hide the orb when the chat is closed. Press Ctrl+Q to open or close the chat panel.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* --- Provider Keys section --- */}
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[13px] font-medium text-white">Provider Keys</div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-3">
                      {desktopState.providerCatalog.map((provider) => {
                        const configured = desktopState.providers.find((item) => item.id === provider.id);
                        return (
                          <div key={provider.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                            <div>
                              <div className="text-[14px] text-white">{provider.label}</div>
                              <div className="mt-1 text-[12px] text-[color:var(--sf-text-2)]">
                                {configured?.keyConfigured ? 'API key stored locally' : provider.needsKey ? 'No API key configured' : 'Key optional'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={configured?.keyConfigured ? 'rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-[11px] text-white' : 'rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] text-[color:var(--sf-text-2)]'}>
                                {configured?.keyConfigured ? 'Configured' : 'Missing'}
                              </div>
                              {configured?.keyConfigured ? (
                                <button
                                  type="button"
                                  className="grid h-8 w-8 place-items-center rounded-full border border-white/12 bg-white/10 text-[color:var(--sf-text-2)] hover:bg-white/14"
                                  onClick={async () => {
                                    try {
                                      const nextState = await window.electronAPI?.removeApiKey?.(provider.id);
                                      if (nextState) setDesktopState(nextState);
                                    } catch (e) {
                                      reportError('Remove API key failed', e);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Save key</div>
                      <div className="mt-4 space-y-3">
                        <label className="block">
                          <span className="mb-2 block text-[12px] text-[color:var(--sf-text-2)]">Provider</span>
                          <select value={providerId} className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none" onChange={(e) => setProviderId(e.target.value)}>
                            {desktopState.providerCatalog.map((provider) => (
                              <option key={provider.id} value={provider.id}>{provider.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[12px] text-[color:var(--sf-text-2)]">API key</span>
                          <input value={apiKey} type="password" className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]" placeholder="sk-..." onChange={(e) => setApiKey(e.target.value)} />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[12px] text-[color:var(--sf-text-2)]">Base URL</span>
                          <input value={apiBaseUrl} className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]" placeholder="Optional override" onChange={(e) => setApiBaseUrl(e.target.value)} />
                        </label>
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.86),rgba(127,147,255,0.82))] px-4 py-3 text-[13px] text-white transition-all duration-200 hover:brightness-110"
                          onClick={async () => {
                            if (!providerId || !apiKey.trim()) return;
                            try {
                              const nextState = await window.electronAPI?.saveApiKey?.({
                                providerId,
                                apiKey: apiKey.trim(),
                                apiBaseUrl: apiBaseUrl.trim(),
                              });
                              if (nextState) setDesktopState(nextState);
                              setApiKey('');
                            } catch (e) {
                              reportError('Save API key failed', e);
                            }
                          }}
                        >
                          Save key securely
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- Model Configuration section --- */}
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[13px] font-medium text-white">Model Configuration</div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-3">
                      {desktopState.connectedModels.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-[13px] text-[color:var(--sf-text-2)]">
                          No models connected yet.
                        </div>
                      ) : (
                        desktopState.connectedModels.map((model) => {
                          const active = model.id === desktopState.selectedModelId;
                          return (
                            <div key={model.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                              <div className="min-w-0">
                                <div className="truncate text-[14px] text-white">{model.label}</div>
                                <div className="mt-1 text-[12px] text-[color:var(--sf-text-2)]">
                                  {(model.providerLabel ?? model.providerId) || 'Provider'} &bull; {model.modelId ?? model.id}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className={
                                    active
                                      ? 'rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-[11px] text-white'
                                      : 'rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] text-white hover:bg-white/14'
                                  }
                                  onClick={() => window.electronAPI?.setSelectedModel?.(model.id)}
                                >
                                  {active ? 'Selected' : 'Use'}
                                </button>
                                <button
                                  type="button"
                                  className="grid h-8 w-8 place-items-center rounded-full border border-white/12 bg-white/10 text-[color:var(--sf-text-2)] hover:bg-white/14"
                                  onClick={async () => {
                                    try {
                                      const nextState = await window.electronAPI?.removeModel?.(model.id);
                                      if (nextState) setDesktopState(nextState);
                                    } catch (e) {
                                      reportError('Remove model failed', e);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Connect model</div>
                      <div className="mt-4 space-y-3">
                        <label className="block">
                          <span className="mb-2 block text-[12px] text-[color:var(--sf-text-2)]">Provider</span>
                          <select value={modelProviderId} className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none" onChange={(e) => setModelProviderId(e.target.value)}>
                            {desktopState.providerCatalog.map((provider) => (
                              <option key={provider.id} value={provider.id}>{provider.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[12px] text-[color:var(--sf-text-2)]">Model ID</span>
                          <input value={modelId} className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]" placeholder="gpt-4.1-mini or llama3.2" onChange={(e) => setModelId(e.target.value)} />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[12px] text-[color:var(--sf-text-2)]">Label</span>
                          <input value={modelLabel} className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]" placeholder="OpenAI reasoning" onChange={(e) => setModelLabel(e.target.value)} />
                        </label>
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.86),rgba(127,147,255,0.82))] px-4 py-3 text-[13px] text-white transition-all duration-200 hover:brightness-110"
                          onClick={async () => {
                            if (!modelProviderId || !modelId.trim()) return;
                            try {
                              const nextState = await window.electronAPI?.saveModel?.({
                                providerId: modelProviderId,
                                modelId: modelId.trim(),
                                label: modelLabel.trim() || modelId.trim(),
                              });
                              if (nextState) setDesktopState(nextState);
                              setModelId('');
                              setModelLabel('');
                            } catch (e) {
                              reportError('Save model failed', e);
                            }
                          }}
                        >
                          Save model
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- Extension Diagnostics section --- */}
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[13px] font-medium text-white">Extension Diagnostics</div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4">
                          <div className="text-[12px] text-[color:var(--sf-muted)]">Connection</div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
                            <div className="text-[18px] text-white">{desktopState.extension.connected ? 'Connected' : 'Idle'}</div>
                          </div>
                        </div>
                        <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4">
                          <div className="text-[12px] text-[color:var(--sf-muted)]">Clients</div>
                          <div className="mt-2 text-[18px] text-white">{desktopState.extension.clients}</div>
                        </div>
                        <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4">
                          <div className="text-[12px] text-[color:var(--sf-muted)]">Last site</div>
                          <div className="mt-2 text-[18px] text-white">{desktopState.extension.lastSite?.toUpperCase() ?? 'None'}</div>
                        </div>
                        <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4">
                          <div className="text-[12px] text-[color:var(--sf-muted)]">Last seen</div>
                          <div className="mt-2 text-[18px] text-white">{formatTimestamp(desktopState.extension.lastSeenAt)}</div>
                        </div>
                      </div>
                      {desktopState.extension.lastError ? (
                        <div className="mt-4 rounded-2xl border border-rose-200/18 bg-rose-300/10 px-4 py-3 text-[12px] text-[color:var(--sf-text)]">
                          {desktopState.extension.lastError}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Setup instructions</div>
                      <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-[color:var(--sf-text-2)]">
                        <li>1. Keep this desktop app running so it can register the extension bridge and accept the local connection.</li>
                        <li>2. Load the browser extension and keep it enabled.</li>
                        <li>3. Open ChatGPT, Claude, Gemini, or a normal browser page to let the extension sync context.</li>
                        <li>4. Open SideFlow chat from the orb or with Ctrl+Q (see SideFlow chat access above).</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
