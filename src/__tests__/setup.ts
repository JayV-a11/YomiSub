import { vi, afterEach } from 'vitest'

// ---- Chrome extension API mock ---------------------------------------------
// Provides a full chrome mock that mirrors the real API shape used by YomiSub.

const storageSyncStore: Record<string, unknown> = {}

const chromeMock = {
  storage: {
    sync: {
      get: vi.fn((keys: string | string[] | null, callback: (result: Record<string, unknown>) => void) => {
        if (typeof keys === 'string') {
          callback({ [keys]: storageSyncStore[keys] })
        } else if (Array.isArray(keys)) {
          const result: Record<string, unknown> = {}
          for (const k of keys) result[k] = storageSyncStore[k]
          callback(result)
        } else {
          callback({ ...storageSyncStore })
        }
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(storageSyncStore, items)
        callback?.()
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        const ks = Array.isArray(keys) ? keys : [keys]
        for (const k of ks) delete storageSyncStore[k]
        callback?.()
      }),
    },
    local: {
      get: vi.fn((_keys: unknown, callback: (r: Record<string, unknown>) => void) => callback({})),
      set: vi.fn((_items: unknown, callback?: () => void) => callback?.()),
      remove: vi.fn((_keys: unknown, callback?: () => void) => callback?.()),
    },
    session: {
      get: vi.fn((_keys: unknown, callback: (r: Record<string, unknown>) => void) => callback({})),
      set: vi.fn((_items: unknown, callback?: () => void) => callback?.()),
    },
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    lastError: null as { message?: string } | null,
  },
}

Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
})

// ---- Reset between tests ---------------------------------------------------
afterEach(() => {
  vi.clearAllMocks()
  chromeMock.runtime.lastError = null
  // Clear storage store
  for (const key of Object.keys(storageSyncStore)) {
    delete storageSyncStore[key]
  }
})

// ---- Export mock for direct access in tests --------------------------------
export { chromeMock }
