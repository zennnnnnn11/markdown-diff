import type { Root } from 'mdast'
import { createMarkdownProcessor } from './create-parser'

export class MarkdownParser {
  private processor

  constructor() {
    this.processor = createMarkdownProcessor()
  }

  async parse(content: string): Promise<Root> {
    const rawAst = this.processor.parse(content)
    return this.processor.run(rawAst) as unknown as Root
  }
}
