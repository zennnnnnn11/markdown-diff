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

// CodeMirror selection overlays ask DOM Range for client rects. jsdom exposes
// Range but does not implement these layout methods.
if (typeof globalThis.Range !== 'undefined') {
  if (typeof globalThis.Range.prototype.getBoundingClientRect !== 'function') {
    globalThis.Range.prototype.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() { return {} },
    })
  }
  if (typeof globalThis.Range.prototype.getClientRects !== 'function') {
    globalThis.Range.prototype.getClientRects = () => ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function *iterator() {},
    }) as DOMRectList
  }
}
