import ManagerApp from './ManagerApp';
import OverlayApp from './OverlayApp';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'manager') return <ManagerApp />;
  if (view === 'overlay' || view == null) return <OverlayApp />;
  if (import.meta.env.DEV) {
    console.warn('[SideFlow] Unknown view param:', view, '— defaulting to overlay');
  }
  return <OverlayApp />;
}
