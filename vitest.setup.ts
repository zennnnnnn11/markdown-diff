if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = {} as typeof CSS
}
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (value: string) =>
    value.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&')
}
