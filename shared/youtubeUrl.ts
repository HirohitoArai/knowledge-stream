const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])

/** Parses an ID or a supported YouTube URL; this does not prove availability or Shorts format. */
export function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim()
  if (VIDEO_ID.test(value)) return value
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    if (parts.length === 1) id = parts[0]
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else if (parts.length === 2 && ['shorts', 'embed'].includes(parts[0])) id = parts[1]
  } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    if (parts.length === 2 && parts[0] === 'embed') id = parts[1]
  }
  return id && VIDEO_ID.test(id) ? id : null
}
