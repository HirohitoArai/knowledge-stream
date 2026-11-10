import type { VideoDto } from '../../shared/api'

/**
 * All on-device state (SPEC sections 2.5 and 3). One LocalStorage key, one
 * wrapper module: viewed ids, saved ids, not-interested ids, the genre
 * selection and the anonymous client id live here and nowhere else, and
 * none of it leaves the device except the client id inside a feedback
 * request (the server stores only its HMAC, SPEC section 5).
 */
export const CLIENT_STATE_KEY = 'knowledge-stream:client-state:v1'

export interface ClientState {
  /** Internal video id -> epoch ms of the latest activation. */
  viewed: Record<string, number>
  saved: string[]
  notInterested: string[]
  /** Selected genre ids; null until the first-run selection is done. */
  selectedCategoryIds: string[] | null
  /** Anonymous id for feedback dedupe; generated once, stored only here. */
  clientId: string
  /**
   * Last known DTO per video id, so the profile's saved list can render
   * labels without another fetch. Cache only; ids remain the truth.
   */
  knownVideos: Record<string, VideoDto>
}

const emptyState = (): ClientState => ({
  viewed: {},
  saved: [],
  notInterested: [],
  selectedCategoryIds: null,
  clientId: crypto.randomUUID(),
  knownVideos: {},
})

function sanitize(parsed: Partial<ClientState> | null): ClientState {
  const base = emptyState()
  if (!parsed || typeof parsed !== 'object') return base
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return {
    viewed: parsed.viewed && typeof parsed.viewed === 'object'
      ? Object.fromEntries(Object.entries(parsed.viewed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
      : {},
    saved: stringArray(parsed.saved),
    notInterested: stringArray(parsed.notInterested),
    selectedCategoryIds: Array.isArray(parsed.selectedCategoryIds) ? stringArray(parsed.selectedCategoryIds) : null,
    clientId: typeof parsed.clientId === 'string' && parsed.clientId.length > 0 ? parsed.clientId : base.clientId,
    knownVideos: parsed.knownVideos && typeof parsed.knownVideos === 'object' ? parsed.knownVideos : {},
  }
}

export function loadClientState(storage: Storage = window.localStorage): ClientState {
  try {
    const raw = storage.getItem(CLIENT_STATE_KEY)
    if (!raw) {
      const fresh = emptyState()
      saveClientState(fresh, storage)
      return fresh
    }
    return sanitize(JSON.parse(raw) as Partial<ClientState>)
  } catch {
    // Corrupt or unavailable storage must never break the app; fall back to
    // an in-memory-only state for this session.
    return emptyState()
  }
}

export function saveClientState(state: ClientState, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(CLIENT_STATE_KEY, JSON.stringify(state))
  } catch {
    // Storage full/blocked: the in-memory state in the caller still works.
  }
}

/** Removes every stored key for this app (SPEC 2.5 local data deletion). */
export function clearClientStorage(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(CLIENT_STATE_KEY)
  } catch {
    // Nothing sensible to do; the caller's reset state still applies.
  }
}
