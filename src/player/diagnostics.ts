// Opt-in, local console only. No URLs, identifiers, storage or network telemetry.
const enabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('diagnostics')
const counts: Record<string, number> = {}
export function countPlayerWork(name: string) {
  if (enabled) counts[name] = (counts[name] ?? 0) + 1
}
export function startDiagnostics() {
  if (!enabled) return () => {}
  const started = performance.now()
  let longTasks = 0, longTaskMs = 0
  const observer = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver(list => {
      for (const entry of list.getEntries()) { longTasks++; longTaskMs += entry.duration }
    }) : null
  observer?.observe({ type: 'longtask' })
  const interval = window.setInterval(() => console.info('[player-diagnostics]', JSON.stringify({
    seconds: Math.round((performance.now() - started) / 1000), ...counts,
    iframes: document.querySelectorAll('.player-surface iframe').length,
    longTasks: observer ? longTasks : null, longTaskMs: observer ? Math.round(longTaskMs) : null,
  })), 5000)
  return () => { clearInterval(interval); observer?.disconnect() }
}
