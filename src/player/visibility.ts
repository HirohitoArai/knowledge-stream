export const ACTIVE_THRESHOLD = 0.65
export interface VisibilitySample { index: number; cardRatio: number; playerRatio: number }

export function selectActive(samples: VisibilitySample[]): number | null {
  const candidate = samples.filter(s => s.cardRatio >= ACTIVE_THRESHOLD && s.playerRatio >= 0.5)
    .sort((a, b) => b.cardRatio - a.cardRatio || a.index - b.index)[0]
  return candidate?.index ?? null
}

export function inMountWindow(index: number, center: number): boolean {
  return Math.abs(index - center) <= 1
}

// Reuse up to three iframe instances; only current ±1 may load media.
export function retainedPlayers(center: number, count: number, previous: number[], preload = true): number[] {
  const wanted = Array.from({ length: count }, (_, index) => index)
    .filter(index => preload ? inMountWindow(index, center) : index === center)
  return [...wanted, ...previous.filter(index => index < count && !wanted.includes(index))]
    .slice(0, preload ? 3 : 1)
}

export function visibleRatio(rect: DOMRect, viewport: DOMRect): number {
  const width = Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left))
  const height = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top))
  return rect.width > 0 && rect.height > 0 ? width * height / (rect.width * rect.height) : 0
}
