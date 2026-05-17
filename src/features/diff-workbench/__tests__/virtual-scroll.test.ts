import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DiffProjectionTable from '../components/DiffProjectionTable.vue'
import UnifiedDiffTable from '../components/UnifiedDiffTable.vue'
import type { ProjectionLine, MergedRow } from '../view-model'

function makeLine(index: number, overrides?: Partial<ProjectionLine>): ProjectionLine {
  return {
    key: `line:${index}`,
    lineNumber: index + 1,
    text: `Line ${index + 1} content`,
    baseTone: 'plain',
    matchedTones: [],
    changeKeys: [],
    alignmentKey: undefined,
    pairKind: undefined,
    hasDescendantChange: false,
    warnings: [],
    annotations: [],
    lineMatches: [],
    ...overrides,
  }
}

function makeMergedRow(index: number, overrides?: Partial<MergedRow>): MergedRow {
  return {
    key: `row:${index}`,
    oldLine: makeLine(index),
    newLine: makeLine(index),
    ...overrides,
  }
}

describe('DiffProjectionTable virtual scroll', () => {
  it('mounts and renders with virtual scrolling', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => makeLine(i))
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: lines,
        activeFilter: null,
        side: 'new' as const,
      },
    })

    await nextTick()
    expect(wrapper.find('.projection-table').exists()).toBe(true)
    const renderedCount = wrapper.findAll('.projection-row').length
    expect(renderedCount).toBeGreaterThan(0)
    expect(renderedCount).toBeLessThan(lines.length)
  })

  it('renders rows with correct line numbers', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => makeLine(i))
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: lines,
        activeFilter: null,
        side: 'new' as const,
      },
    })

    await nextTick()
    const lineNumbers = wrapper.findAll('.line-number')
    expect(lineNumbers.length).toBeGreaterThan(0)
    expect(lineNumbers[0]!.text()).toBe('1')
  })

  it('exposes scrollToIndex method', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => makeLine(i))
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: lines,
        activeFilter: null,
        side: 'new' as const,
      },
    })

    await nextTick()
    const exposed = wrapper.vm as any
    expect(typeof exposed.scrollToIndex).toBe('function')
  })

  it('emits select event when interactive row is clicked', async () => {
    const lines = [
      makeLine(0, { changeKey: 'change:1', baseTone: 'insert' }),
      makeLine(1),
    ]
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: lines,
        activeFilter: null,
        side: 'new' as const,
      },
    })

    await nextTick()
    const interactiveRows = wrapper.findAll('.projection-row.interactive')
    expect(interactiveRows.length).toBeGreaterThan(0)
    await interactiveRows[0]!.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['change:1', 'new'])
  })

  it('applies active filter class to matching lines', async () => {
    const lines = [
      makeLine(0, { baseTone: 'insert', changeKey: 'c:1', matchedTones: ['insert'] }),
      makeLine(1),
    ]
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: lines,
        activeFilter: 'insert' as const,
        side: 'new' as const,
      },
    })

    await nextTick()
    const activeRows = wrapper.findAll('.projection-row.active')
    expect(activeRows.length).toBeGreaterThan(0)
  })

  it('handles empty projectionLines', async () => {
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: [],
        activeFilter: null,
        side: 'old' as const,
      },
    })

    await nextTick()
    expect(wrapper.findAll('.projection-row').length).toBe(0)
  })

  it('renders peer-highlight class for matching changeKey', async () => {
    const lines = [
      makeLine(0, { changeKey: 'peer:1', baseTone: 'move' }),
    ]
    const wrapper = mount(DiffProjectionTable, {
      props: {
        projectionLines: lines,
        activeFilter: null,
        peerHighlightKey: 'peer:1',
        side: 'new' as const,
      },
    })

    await nextTick()
    const highlighted = wrapper.findAll('.peer-highlight')
    expect(highlighted.length).toBeGreaterThan(0)
  })
})

describe('UnifiedDiffTable virtual scroll', () => {
  it('mounts and renders with virtual scrolling', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => makeMergedRow(i))
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: rows,
        activeFilter: null,
      },
    })

    await nextTick()
    expect(wrapper.find('.unified-table').exists()).toBe(true)
    const renderedCount = wrapper.findAll('.unified-row').length
    expect(renderedCount).toBeGreaterThan(0)
    expect(renderedCount).toBeLessThan(rows.length)
  })

  it('renders sticky header row', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeMergedRow(i))
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: rows,
        activeFilter: null,
      },
    })

    await nextTick()
    expect(wrapper.find('.unified-header-row').exists()).toBe(true)
    expect(wrapper.find('.side-heading-old').text()).toBe('旧文档')
    expect(wrapper.find('.side-heading-new').text()).toBe('新文档')
  })

  it('exposes scrollToIndex method', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeMergedRow(i))
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: rows,
        activeFilter: null,
      },
    })

    await nextTick()
    const exposed = wrapper.vm as any
    expect(typeof exposed.scrollToIndex).toBe('function')
  })

  it('emits select event for old side click', async () => {
    const rows = [
      makeMergedRow(0, {
        oldLine: makeLine(0, { changeKey: 'c:old', baseTone: 'delete' }),
      }),
    ]
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: rows,
        activeFilter: null,
      },
    })

    await nextTick()
    const interactiveGutters = wrapper.findAll('.gutter.interactive')
    expect(interactiveGutters.length).toBeGreaterThan(0)
    await interactiveGutters[0]!.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('renders placeholder text when one side is null', async () => {
    const rows = [
      makeMergedRow(0, {
        oldLine: null,
        newLine: makeLine(0, { text: 'only new' }),
      }),
    ]
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: rows,
        activeFilter: null,
      },
    })

    await nextTick()
    const placeholders = wrapper.findAll('.placeholder-text')
    expect(placeholders.length).toBeGreaterThan(0)
  })

  it('handles empty mergedRows', async () => {
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: [],
        activeFilter: null,
      },
    })

    await nextTick()
    expect(wrapper.findAll('.unified-row').length).toBe(0)
  })

  it('displays row index starting from 1', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeMergedRow(i))
    const wrapper = mount(UnifiedDiffTable, {
      props: {
        mergedRows: rows,
        activeFilter: null,
      },
    })

    await nextTick()
    const rowIndices = wrapper.findAll('.unified-row .row-index')
    expect(rowIndices.length).toBeGreaterThan(0)
    expect(rowIndices[0]!.text()).toBe('1')
  })
})
