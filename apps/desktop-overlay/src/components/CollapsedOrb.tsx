import { useEffect, useRef, useState } from 'react';
import type { AnimationEvent, CSSProperties, KeyboardEvent } from 'react';

export type ExpansionOrigin = { originX: number; originY: number };

type Props = {
  onExpandComplete: (info: ExpansionOrigin) => void | Promise<void>;
};

const DEFAULT_INFO = { orbLeft: 36, orbTop: 36, originX: 50, originY: 50 };

export function CollapsedOrb({ onExpandComplete }: Props) {
  const [burst, setBurst] = useState(false);
  const [orbOffset, setOrbOffset] = useState<{ left: number; top: number } | null>(null);
  const openedRef = useRef(false);
  const preparingRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);
  const expansionInfoRef = useRef<ExpansionOrigin & { orbLeft: number; orbTop: number }>({
    ...DEFAULT_INFO,
  });

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const finishOpen = (info?: ExpansionOrigin) => {
    if (openedRef.current) return;
    openedRef.current = true;
    preparingRef.current = false;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const origin = info ?? {
      originX: expansionInfoRef.current.originX,
      originY: expansionInfoRef.current.originY,
    };
    void onExpandComplete(origin);
  };

  const runOpen = async () => {
    if (burst || preparingRef.current) return;
    preparingRef.current = true;

    try {
      const raw =
        (await window.electronAPI?.getExpansionInfo?.()) ?? DEFAULT_INFO;
      const info = { ...raw };
      expansionInfoRef.current = info;

      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await window.electronAPI?.prepareExpand?.();
        finishOpen({ originX: info.originX, originY: info.originY });
        return;
      }

      setOrbOffset({ left: info.orbLeft, top: info.orbTop });
      setBurst(true);

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      await window.electronAPI?.prepareExpand?.();

      fallbackTimerRef.current = window.setTimeout(() => {
        finishOpen({ originX: info.originX, originY: info.originY });
      }, 400);
    } catch (e) {
      console.warn('[SideFlow] runOpen failed:', e);
      preparingRef.current = false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void runOpen();
  };

  const handleAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (!burst) return;
    if (e.animationName !== 'collapsed-orb-burst' && e.animationName !== 'collapsed-orb-burst-fade') return;
    if (e.target !== e.currentTarget) return;
    finishOpen();
  };

  const orbStyle: CSSProperties | undefined = orbOffset
    ? {
        ['--orb-left' as string]: `${orbOffset.left}px`,
        ['--orb-top' as string]: `${orbOffset.top}px`,
      }
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      className={['collapsed-orb', burst ? 'collapsed-orb--burst' : ''].filter(Boolean).join(' ')}
      style={orbStyle}
      onClick={() => void runOpen()}
      onKeyDown={handleKeyDown}
      onAnimationEnd={handleAnimationEnd}
      aria-label="Open SideFlow"
    >
      <svg
        className="collapsed-orb__svg"
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="collapsed-orb-glow" x1="12" y1="8" x2="36" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#79b6ff" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#7f93ff" stopOpacity="0.80" />
            <stop offset="1" stopColor="#89e0ff" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="collapsed-orb-ring" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(137,224,255,0.32)" />
            <stop offset="1" stopColor="rgba(121,182,255,0.08)" />
          </linearGradient>
          <radialGradient id="collapsed-orb-core" cx="24" cy="22" r="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(121,182,255,0.10)" />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="collapsed-orb-reflect" x1="14" y1="10" x2="32" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(255,255,255,0.16)" />
            <stop offset="0.5" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="1" stopColor="transparent" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="22" r="14" fill="url(#collapsed-orb-core)" />
        <ellipse cx="22" cy="18" rx="10" ry="7" fill="url(#collapsed-orb-reflect)" />
        <circle cx="24" cy="24" r="20" stroke="url(#collapsed-orb-ring)" strokeWidth="0.75" opacity="0.9" />
        <path
          d="M14 28c4-8 10-12 16-12 4 0 7 2 9 5"
          stroke="url(#collapsed-orb-glow)"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 22c3.5-5 8.5-8 14-8 6 0 11 3.5 14 9"
          stroke="url(#collapsed-orb-glow)"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
        <path
          d="M18 34c5-3 10-4 15-2.5"
          stroke="url(#collapsed-orb-glow)"
          strokeWidth="1.05"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}
