import type { VideoDto } from '../../shared/api'

/**
 * Feed ordering (SPEC section 3), as a pure function so the rules are
 * testable without the player:
 * - not-interested videos are excluded entirely;
 * - unwatched videos come first, watched videos after;
 * - each group is shuffled;
 * - when every candidate is watched, the watched group alone forms the
 *   next cycle (the caller rebuilds the order to start a new cycle).
 */
export function buildFeedOrder(
  candidates: VideoDto[],
  viewedIds: ReadonlySet<string>,
  notInterestedIds: ReadonlySet<string>,
  random: () => number = Math.random,
): VideoDto[] {
  const visible = candidates.filter(video => !notInterestedIds.has(video.id))
  const unwatched = visible.filter(video => !viewedIds.has(video.id))
  const watched = visible.filter(video => viewedIds.has(video.id))
  return [...shuffle(unwatched, random), ...shuffle(watched, random)]
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1))
    ;[result[index], result[swapWith]] = [result[swapWith], result[index]]
  }
  return result
}
