import { LayoutDashboard, MessageSquareText, Orbit, Settings } from 'lucide-react';
import type { TabId } from './types';
import { formatTimestamp } from '../../lib/format';

export const NAV_ITEMS: Array<{ id: TabId; label: string; icon: typeof Orbit }> = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'chats', label: 'Chats', icon: MessageSquareText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

type Props = {
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
  statusTone: string;
  desktopState: DesktopState;
};

export function MainAppSidebar({ activeTab, setActiveTab, statusTone, desktopState }: Props) {
  return (
    <aside className="min-h-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] p-4 shadow-[var(--sf-shadow-soft)]">
      <div className="space-y-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              className={
                active
                  ? 'flex w-full items-center gap-3 rounded-2xl border border-white/14 bg-white/12 px-3.5 py-3 text-left text-[13px] text-white'
                  : 'flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] px-3.5 py-3 text-left text-[13px] text-[color:var(--sf-text-2)] hover:border-white/10 hover:bg-white/[0.08]'
              }
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-[24px] border border-[color:var(--sf-border-soft)] bg-[color:var(--sf-surface-soft)] p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sf-muted)]">
          <div className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
          Extension
        </div>
        <div className="mt-3 text-[13px] text-[color:var(--sf-text)]">
          {desktopState.extension.connected ? 'Connected' : 'Waiting for extension'}
        </div>
        <div className="mt-2 text-[12px] leading-relaxed text-[color:var(--sf-text-2)]">
          Last ping: {formatTimestamp(desktopState.extension.lastSeenAt)}
        </div>
      </div>
    </aside>
  );
}
