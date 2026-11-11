export function formatChange(change: number) {
  if (change === 0) return '0%'
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
}
