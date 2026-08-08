import '@testing-library/jest-dom/vitest'

// Mock window.matchMedia - jsdom doesn't implement this API natively, and it's added preemptively per Mantine's documented jsdom test-setup guidance. Mantine's own color-scheme and media-query hooks guard against its absence, so this particular test may not strictly require it, but it's provided since setup.ts is shared by all future tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
})

// jsdom itself implements Storage correctly, but this repo's Node runtime (22+) exposes its own
// experimental global `localStorage`, which Vitest's jsdom-environment global-copying logic treats
// as already-present and therefore does not override with jsdom's real, working instance. This mock
// fills that gap with a correct Storage implementation — it is not a jsdom limitation workaround.
if (!window.localStorage) {
  const store: Record<string, string> = {}
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString()
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        Object.keys(store).forEach((key) => {
          delete store[key]
        })
      },
      key: (index: number) => Object.keys(store)[index] || null,
      get length() {
        return Object.keys(store).length
      },
    },
  })
}
