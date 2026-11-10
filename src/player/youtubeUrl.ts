/**
 * The implementation lives in shared/youtubeUrl.ts so the admin API can
 * validate YouTube URLs on the server with exactly the same rules as the
 * client. This module only re-exports it for existing imports.
 */
export { extractYouTubeVideoId } from '../../shared/youtubeUrl'
