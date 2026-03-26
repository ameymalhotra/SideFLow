import { useEffect, useRef, useState } from 'react';
import type { AnimationEvent, KeyboardEvent } from 'react';

type Props = {
  onExpandComplete: () => void | Promise<void>;
};

export function CollapsedOrb({ onExpandComplete }: Props) {
  const [burst, setBurst] = useState(false);
  const openedRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const finishOpen = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    void onExpandComplete();
  };

  const runOpen = () => {
    if (burst) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishOpen();
      return;
    }
    setBurst(true);
    fallbackTimerRef.current = window.setTimeout(() => {
      finishOpen();
    }, 340);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    runOpen();
  };

  const handleAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (!burst) return;
    if (e.animationName !== 'collapsed-orb-burst' && e.animationName !== 'collapsed-orb-burst-fade') return;
    if (e.target !== e.currentTarget) return;
    finishOpen();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={['collapsed-orb', burst ? 'collapsed-orb--burst' : ''].filter(Boolean).join(' ')}
      onClick={runOpen}
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
            <stop stopColor="rgba(255,255,255,0.95)" />
            <stop offset="0.45" stopColor="rgba(200,230,255,0.85)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.55)" />
          </linearGradient>
          <linearGradient id="collapsed-orb-faint" x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(255,255,255,0.35)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.08)" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="20" stroke="url(#collapsed-orb-faint)" strokeWidth="0.75" opacity="0.9" />
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
          opacity="0.75"
        />
        <path
          d="M18 34c5-3 10-4 15-2.5"
          stroke="url(#collapsed-orb-glow)"
          strokeWidth="1.05"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
