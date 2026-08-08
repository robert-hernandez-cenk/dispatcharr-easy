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
