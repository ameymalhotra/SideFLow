/// <reference types="vite/client" />

interface ElectronAPI {
  onContextUpdate: (cb: (data: string) => void) => () => void;
  onFocusInput?: (cb: () => void) => () => void;
  onOverlayMode?: (cb: (mode: 'collapsed' | 'expanded') => void) => () => void;
  onOverlayBoundsChanged?: (
    cb: (payload: { mode: 'collapsed' | 'expanded'; x: number; y: number }) => void,
  ) => () => void;
  hideWindow: () => void;
  expandOverlay?: () => void;
  collapseOverlay?: () => void;
  getOverlayState?: () => Promise<{ mode: 'collapsed' | 'expanded'; x: number; y: number }>;
  moveOverlay?: (x: number, y: number) => Promise<{ x: number; y: number }>;
  saveOverlayPosition?: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
