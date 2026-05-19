import { useState } from 'react';
import { LayoutDashboard, Orbit } from 'lucide-react';
import { formatTimestamp } from '../../lib/format';
import type { OnboardingStep } from './types';

interface OnboardingProps {
  desktopState: DesktopState;
  setDesktopState: (state: DesktopState) => void;
  reportError: (label: string, err: unknown) => void;
}

const ONBOARDING_PROGRESS = [
  {
    title: 'Welcome',
    body: 'Meet SideFlow — your desktop companion, browser extension, and floating orb working together.',
  },
  {
    title: 'Add provider & model',
    body: 'Store an API key and connect a model so SideFlow can power your follow-up questions.',
  },
  {
    title: 'Connect extension',
    body: 'Link the browser extension so SideFlow can see your active AI conversations.',
  },
] as const;

export function Onboarding({ desktopState, setDesktopState, reportError }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>(0);
  const [providerId, setProviderId] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [modelProviderId, setModelProviderId] = useState('openai');
  const [modelId, setModelId] = useState('');
  const [modelLabel, setModelLabel] = useState('');

  const setupChecks = {
    extensionConnected: desktopState.extension.connected,
    hasProviderKey: desktopState.providers.some((provider) => provider.keyConfigured),
    hasModel: desktopState.connectedModels.length > 0,
  };

  const statusTone = desktopState.extension.connected
    ? 'bg-emerald-300/80'
    : desktopState.extension.lastError
      ? 'bg-rose-300/80'
      : 'bg-amber-200/80';

  const launchOrbButtonLabel = desktopState.preferences?.showFloatingOrb !== false ? 'Focus Orb' : 'Open chat';

  return (
    <div className="manager-shell h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(121,182,255,0.20),transparent_30%),linear-gradient(180deg,#0d1422,#0a111d)] text-white">
      <div className="mx-auto flex h-full max-w-[1320px] flex-col px-6 py-6">
        <div className="grid min-h-0 flex-1 grid-cols-[440px_minmax(0,1fr)] gap-6">
          {/* Left panel — progress sidebar */}
          <section className="flex min-h-0 flex-col justify-between overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.05] p-8 shadow-[var(--sf-shadow-soft)]">
            <div>
              <div className="text-[12px] font-semibold tracking-[0.24em] text-[color:var(--sf-text-2)]">WELCOME TO SIDEFLOW</div>
              <h1 className="mt-5 max-w-[14ch] text-[42px] font-semibold leading-[1.02] text-white">
                Get set up in under a minute.
              </h1>
              <p className="mt-5 max-w-[40ch] text-[15px] leading-relaxed text-[color:var(--sf-text-2)]">
                The desktop app manages providers, API keys, and your extension connection. The floating orb stays separate for chat.
              </p>

              <div className="mt-8 space-y-3">
                {ONBOARDING_PROGRESS.map((entry, index) => {
                  const active = index === step;
                  const complete = index < step;
                  return (
                    <div
                      key={entry.title}
                      className={`transition-all duration-300 ease-out ${
                        active
                          ? 'rounded-[24px] border border-white/16 bg-white/[0.10] px-4 py-4 scale-[1.01]'
                          : complete
                            ? 'rounded-[24px] border border-emerald-200/14 bg-emerald-300/8 px-4 py-4'
                            : 'rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`grid h-7 w-7 place-items-center rounded-full border text-[11px] transition-colors duration-300 ${
                          complete
                            ? 'border-emerald-300/30 bg-emerald-400/20 text-emerald-200'
                            : active
                              ? 'border-white/20 bg-white/[0.12] text-white'
                              : 'border-white/10 bg-white/[0.08] text-[color:var(--sf-text-2)]'
                        }`}>
                          {complete ? '\u2713' : index + 1}
                        </div>
                        <div className="text-[14px] text-white">{entry.title}</div>
                      </div>
                      <div className="mt-2 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">{entry.body}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-6">
              <button
                type="button"
                className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[13px] text-[color:var(--sf-text-2)] transition-colors hover:bg-white/[0.1]"
                onClick={async () => {
                  try {
                    const nextState = await window.electronAPI?.completeOnboarding?.({ skipped: true });
                    if (nextState) setDesktopState(nextState);
                  } catch (e) {
                    reportError('Skip setup failed', e);
                  }
                }}
              >
                Skip setup
              </button>
              <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--sf-muted)]">
                {step + 1} / {ONBOARDING_PROGRESS.length}
              </div>
            </div>
          </section>

          {/* Right panel — step content */}
          <section className="min-h-0 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.05] p-8 shadow-[var(--sf-shadow-soft)]">
            {step === 0 ? (
              <div className="flex h-full flex-col justify-between animate-[fadeSlideIn_0.35s_ease-out]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Step 1</div>
                  <h2 className="mt-3 text-[30px] font-semibold text-white">How SideFlow works</h2>
                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 transition-transform duration-300 hover:scale-[1.02]">
                      <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
                        <LayoutDashboard size={18} className="text-blue-300/80" />
                      </div>
                      <div className="text-[13px] text-white">Desktop app</div>
                      <div className="mt-2 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                        Stores keys, provider connections, synced chats, and extension health.
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 transition-transform duration-300 hover:scale-[1.02]">
                      <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300/80"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </div>
                      <div className="text-[13px] text-white">Browser extension</div>
                      <div className="mt-2 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                        Captures chat context from ChatGPT, Claude, Gemini and streams it to the desktop.
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 transition-transform duration-300 hover:scale-[1.02]">
                      <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
                        <Orbit size={18} className="text-cyan-300/80" />
                      </div>
                      <div className="text-[13px] text-white">Floating orb</div>
                      <div className="mt-2 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                        Your always-available SideFlow chat interface, floating above everything.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-8">
                  <button
                    type="button"
                    className="rounded-full border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] px-5 py-2.5 text-[13px] text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                    onClick={() => setStep(1)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="flex h-full flex-col justify-between animate-[fadeSlideIn_0.35s_ease-out]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Step 2</div>
                  <h2 className="mt-3 text-[30px] font-semibold text-white">Add a provider and model</h2>
                  <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-[13px] text-white">Provider key</div>
                      <div className="mt-4 space-y-3">
                        <select
                          value={providerId}
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none"
                          onChange={(e) => setProviderId(e.target.value)}
                        >
                          {desktopState.providerCatalog.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={apiKey}
                          type="password"
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]"
                          placeholder="API key"
                          onChange={(e) => setApiKey(e.target.value)}
                        />
                        <input
                          value={apiBaseUrl}
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]"
                          placeholder="Optional base URL"
                          onChange={(e) => setApiBaseUrl(e.target.value)}
                        />
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.08] px-4 py-3 text-[13px] text-white transition-colors hover:bg-white/[0.12]"
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
                              reportError('Save provider key failed', e);
                            }
                          }}
                        >
                          Save provider key
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-[13px] text-white">Model connection</div>
                      <div className="mt-4 space-y-3">
                        <select
                          value={modelProviderId}
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none"
                          onChange={(e) => setModelProviderId(e.target.value)}
                        >
                          {desktopState.providerCatalog.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={modelId}
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]"
                          placeholder="Model ID"
                          onChange={(e) => setModelId(e.target.value)}
                        />
                        <input
                          value={modelLabel}
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[color:var(--sf-muted)]"
                          placeholder="Label"
                          onChange={(e) => setModelLabel(e.target.value)}
                        />
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-white/12 bg-white/[0.08] px-4 py-3 text-[13px] text-white transition-colors hover:bg-white/[0.12]"
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

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className={`rounded-2xl border px-4 py-3 text-[12px] transition-colors duration-300 ${setupChecks.hasProviderKey ? 'border-emerald-200/18 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.04] text-[color:var(--sf-text-2)]'}`}>
                      Provider key: {setupChecks.hasProviderKey ? 'saved' : 'missing'}
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-[12px] transition-colors duration-300 ${setupChecks.hasModel ? 'border-emerald-200/18 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.04] text-[color:var(--sf-text-2)]'}`}>
                      Model: {setupChecks.hasModel ? 'connected' : 'missing'}
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-[12px] transition-colors duration-300 ${setupChecks.extensionConnected ? 'border-emerald-200/18 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.04] text-[color:var(--sf-text-2)]'}`}>
                      Extension: {setupChecks.extensionConnected ? 'connected' : 'not yet'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-8">
                  <button
                    type="button"
                    className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[13px] text-[color:var(--sf-text-2)] transition-colors hover:bg-white/[0.1]"
                    onClick={() => setStep(0)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] px-5 py-2.5 text-[13px] text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                    onClick={() => setStep(2)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="flex h-full flex-col justify-between animate-[fadeSlideIn_0.35s_ease-out]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">Step 3</div>
                  <h2 className="mt-3 text-[30px] font-semibold text-white">Connect the extension</h2>
                  <p className="mt-4 max-w-[58ch] text-[14px] leading-relaxed text-[color:var(--sf-text-2)]">
                    Keep this app open. Load the browser extension, then browse to ChatGPT, Claude, Gemini, or a regular page. SideFlow will show live connection status here.
                  </p>
                  <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex items-center gap-3">
                      <div className={`h-3.5 w-3.5 rounded-full transition-colors duration-500 ${statusTone}`} />
                      <div className="text-[15px] text-white">
                        {desktopState.extension.connected ? 'Extension connected' : 'Waiting for extension connection'}
                      </div>
                    </div>
                    <div className="mt-4 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                      Browser extension connects via Chrome Native Messaging (no extra setup). The app also listens on{' '}
                      <code className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[11px]">ws://127.0.0.1:9847</code>{' '}
                      for the local bridge.
                    </div>
                    <div className="mt-2 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
                      Last seen: {formatTimestamp(desktopState.extension.lastSeenAt)}
                    </div>
                    {desktopState.extension.lastError ? (
                      <div className="mt-4 rounded-2xl border border-rose-200/18 bg-rose-300/10 px-4 py-3 text-[12px] text-[color:var(--sf-text)]">
                        {desktopState.extension.lastError}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className={`rounded-2xl border px-4 py-3 text-[12px] transition-colors duration-300 ${setupChecks.hasProviderKey ? 'border-emerald-200/18 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.04] text-[color:var(--sf-text-2)]'}`}>
                      Provider key: {setupChecks.hasProviderKey ? 'saved' : 'missing'}
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-[12px] transition-colors duration-300 ${setupChecks.hasModel ? 'border-emerald-200/18 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.04] text-[color:var(--sf-text-2)]'}`}>
                      Model: {setupChecks.hasModel ? 'connected' : 'missing'}
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-[12px] transition-colors duration-300 ${setupChecks.extensionConnected ? 'border-emerald-200/18 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.04] text-[color:var(--sf-text-2)]'}`}>
                      Extension: {setupChecks.extensionConnected ? 'connected' : 'not yet'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-8">
                  <button
                    type="button"
                    className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[13px] text-[color:var(--sf-text-2)] transition-colors hover:bg-white/[0.1]"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[13px] text-[color:var(--sf-text-2)] transition-colors hover:bg-white/[0.1]"
                      onClick={() => void window.electronAPI?.launchOrb?.()}
                    >
                      {launchOrbButtonLabel}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-blue-100/20 bg-[linear-gradient(145deg,rgba(121,182,255,0.92),rgba(127,147,255,0.88))] px-5 py-2.5 text-[13px] text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                      onClick={async () => {
                        try {
                          const nextState = await window.electronAPI?.completeOnboarding?.({ skipped: false });
                          if (nextState) setDesktopState(nextState);
                        } catch (e) {
                          reportError('Finish setup failed', e);
                        }
                      }}
                    >
                      Finish setup
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
