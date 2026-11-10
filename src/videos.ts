import { extractYouTubeVideoId } from './player/youtubeUrl'

/**
 * A video as the feed renders it. Matches the server DTO (shared VideoDto)
 * plus the fields the player needs; the fixed fixtures below and the feed
 * API both produce this shape.
 */
export interface TestVideo {
  id: string
  externalVideoId: string
  label: string
  categories: string[]
}

// Edit only this list to replace fixtures. `source` accepts a YouTube URL or raw video ID.
// Public Shorts pages verified 2026-10-15; playback verification is recorded in docs/PHASE1_5_SHORTS.md.
// Labels are our own descriptions, not official YouTube titles.
export const videoSources = [
  { id: '48dba56f-3271-4bb9-b59e-dca27c7221c0', source: 'https://www.youtube.com/shorts/pgGrQjYcm5A', label: 'ピザで円周率を考える', categories: ['数学'] },
  { id: '4a995ef1-1cd7-414d-983b-a60f0dc97086', source: 'https://www.youtube.com/shorts/uDeQB9OkoXY', label: '真球に近いシリコン球と計測', categories: ['ものづくり'] },
  { id: 'c225d68d-a34c-4a70-bc95-d00cc546aec4', source: 'https://www.youtube.com/shorts/Ko02mUWhItA', label: '風洞で観察する雨粒のかたち', categories: ['物理'] },
]

export const testVideos: TestVideo[] = videoSources.map(({ source, ...video }) => {
  const externalVideoId = extractYouTubeVideoId(source)
  if (!externalVideoId) throw new Error(`Invalid YouTube source in src/videos.ts: ${video.id}`)
  return { ...video, externalVideoId }
})
