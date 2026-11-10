// Client state wrapper tests against an in-memory Storage stand-in.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CLIENT_STATE_KEY, clearClientStorage, loadClientState, saveClientState } from '../src/state/clientState'

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    map,
  } as unknown as Storage & { map: Map<string, string> }
}

describe('client state storage', () => {
  it('creates and persists a fresh state with a generated client id', () => {
    const storage = memoryStorage()
    const state = loadClientState(storage)
    expect(state.selectedCategoryIds).toBeNull()
    expect(state.clientId).toMatch(/^[0-9a-f-]{36}$/)
    expect(storage.map.has(CLIENT_STATE_KEY)).toBe(true)
    // The generated id is stable across loads.
    expect(loadClientState(storage).clientId).toBe(state.clientId)
  })

  it('round-trips updates through save and load', () => {
    const storage = memoryStorage()
    const state = loadClientState(storage)
    saveClientState({
      ...state,
      viewed: { 'video-1': 123 },
      saved: ['video-1'],
      notInterested: ['video-2'],
      selectedCategoryIds: ['cat-1'],
    }, storage)
    const reloaded = loadClientState(storage)
    expect(reloaded.viewed).toEqual({ 'video-1': 123 })
    expect(reloaded.saved).toEqual(['video-1'])
    expect(reloaded.notInterested).toEqual(['video-2'])
    expect(reloaded.selectedCategoryIds).toEqual(['cat-1'])
  })

  it('survives corrupt stored JSON by falling back to a fresh state', () => {
    const storage = memoryStorage({ [CLIENT_STATE_KEY]: '{broken' })
    const state = loadClientState(storage)
    expect(state.saved).toEqual([])
    expect(state.clientId).toBeTruthy()
  })

  it('drops malformed fields instead of trusting them', () => {
    const storage = memoryStorage({
      [CLIENT_STATE_KEY]: JSON.stringify({ saved: [1, 'ok'], viewed: { a: 'no' }, selectedCategoryIds: 'x' }),
    })
    const state = loadClientState(storage)
    expect(state.saved).toEqual(['ok'])
    expect(state.viewed).toEqual({})
    expect(state.selectedCategoryIds).toBeNull()
  })

  it('clear removes the stored state entirely', () => {
    const storage = memoryStorage()
    loadClientState(storage)
    clearClientStorage(storage)
    expect(storage.map.has(CLIENT_STATE_KEY)).toBe(false)
  })
})
