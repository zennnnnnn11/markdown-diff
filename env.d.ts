/// <reference types="vite/client" />

declare module 'remark-heading-id' {
  const remarkHeadingId: import('unified').Plugin<[], import('mdast').Root>
  export default remarkHeadingId
}
