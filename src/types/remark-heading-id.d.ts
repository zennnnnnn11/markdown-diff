declare module 'remark-heading-id' {
  import type { Plugin } from 'unified'

  const remarkHeadingId: Plugin<[], object, object>

  export default remarkHeadingId
}
