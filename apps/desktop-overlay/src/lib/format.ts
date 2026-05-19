export function formatTimestamp(ts: number | null) {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
