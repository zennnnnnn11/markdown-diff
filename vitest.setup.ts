if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = {} as typeof CSS
}
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (value: string) =>
    value.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&')
}

// jsdom does not implement CSS layout — offsetWidth, offsetHeight, and
// getBoundingClientRect always return 0.  @tanstack/vue-virtual uses
// offsetWidth/offsetHeight (via its internal getRect helper) to determine the
// scroll-container size and to measure individual items.  Without a non-zero
// container size the virtualizer computes an empty visible range and renders
// nothing, which breaks integration tests that expect DOM rows.
//
// Providing a fixed non-zero fallback lets virtual lists render items in tests.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() { return 5000 },
})
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() { return 1200 },
})

// ResizeObserver is required by @tanstack/vue-virtual for observing scroll
// containers and measured elements.  jsdom does not provide it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
