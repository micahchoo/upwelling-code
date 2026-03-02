/**
 * SPIKE: @automerge/prosemirror bridge for nested lists
 *
 * Tests whether @automerge/prosemirror can handle:
 * 1. Nested lists (bullet_list > list_item > paragraph > text)
 * 2. Round-trip: PM doc -> Automerge spans -> PM doc
 * 3. DocHandle adapter wrapping our Draft class
 * 4. Custom marks (comment, em, strong)
 * 5. Mixed content: paragraphs, headings, lists, marked text
 * 6. Concurrent edits to lists merging correctly
 *
 * Run: npx tsx test/spike-prosemirror-bridge.ts
 */

import * as Automerge from '@automerge/automerge'
import { next as am } from '@automerge/automerge'
import {
  SchemaAdapter,
  pmDocFromSpans,
  pmNodeToSpans,
  type MappedSchemaSpec,
  type DocHandle,
} from '@automerge/prosemirror'
import { Node } from 'prosemirror-model'
import { Draft, createAuthorId } from '../src/index.js'
import * as assert from 'assert'

// ============================================================
// Schema with lists, blockquotes, headings, and custom comment mark
// ============================================================

const upwellSchema: MappedSchemaSpec = {
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      automerge: { block: 'paragraph' },
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() { return ['p', 0] },
    },
    heading: {
      automerge: {
        block: 'heading',
        attrParsers: {
          fromAutomerge: (block: any) => ({ level: block.attrs.level || 1 }),
          fromProsemirror: (node: Node) => ({ level: node.attrs.level }),
        },
      },
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ],
      toDOM(node: Node) { return ['h' + node.attrs.level, 0] },
    },
    blockquote: {
      automerge: { block: 'blockquote' },
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() { return ['blockquote', 0] },
    },
    code_block: {
      automerge: { block: 'code-block' },
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' as const }],
      toDOM() { return ['pre', ['code', 0]] },
    },
    unknownBlock: {
      automerge: { unknownBlock: true },
      group: 'block',
      content: 'block+',
      parseDOM: [{ tag: 'div', attrs: { 'data-unknown-block': 'true' } }],
      toDOM() { return ['div', { 'data-unknown-block': 'true' }, 0] },
    },
    ordered_list: {
      group: 'block',
      content: 'list_item+',
      attrs: { order: { default: 1 } },
      parseDOM: [{
        tag: 'ol',
        getAttrs(dom: any) {
          return { order: dom.hasAttribute('start') ? +dom.getAttribute('start')! : 1 }
        },
      }],
      toDOM(node: Node) {
        return node.attrs.order == 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0]
      },
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM() { return ['ul', 0] },
    },
    list_item: {
      automerge: {
        block: {
          within: {
            ordered_list: 'ordered-list-item',
            bullet_list: 'unordered-list-item',
          },
        },
      },
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM() { return ['li', 0] },
      defining: true,
    },
    text: { group: 'inline' },
  },
  marks: {
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM() { return ['em', 0] },
      automerge: { markName: 'em' },
    },
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM() { return ['strong', 0] },
      automerge: { markName: 'strong' },
    },
    comment: {
      attrs: { id: { default: '' } },
      inclusive: false,
      toDOM(node: any) { return ['span', { class: 'comment', 'data-comment-id': node.attrs.id }, 0] },
      automerge: {
        markName: 'comment',
        parsers: {
          fromAutomerge: (value: any) => ({ id: typeof value === 'string' ? value : '' }),
          fromProsemirror: (mark: any) => mark.attrs.id || '',
        },
      },
    },
  },
}

// ============================================================
// DocHandle adapter for Draft
// ============================================================

class DraftDocHandle implements DocHandle<any> {
  private draft: Draft
  constructor(draft: Draft) { this.draft = draft }
  docSync() { return this.draft.doc }
  doc() { return this.draft.doc }
  change(fn: (doc: any) => void) {
    this.draft.doc = Automerge.change(this.draft.doc, fn)
  }
  on() {}
  off() {}
}

// ============================================================
// Test runner
// ============================================================

let passed = 0, failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (e: any) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${e.message}`)
    failed++
  }
}

// ============================================================
// Tests
// ============================================================

console.log('\nSPIKE: @automerge/prosemirror bridge\n')

test('SchemaAdapter creates schema with list support', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  assert.ok(adapter.schema.nodes.bullet_list)
  assert.ok(adapter.schema.nodes.ordered_list)
  assert.ok(adapter.schema.nodes.list_item)
  assert.ok(adapter.schema.marks.comment)
  assert.ok(adapter.schema.marks.em)
  assert.ok(adapter.schema.marks.strong)
  const listMappings = adapter.nodeMappings.filter(m =>
    m.blockName === 'ordered-list-item' || m.blockName === 'unordered-list-item'
  )
  assert.ok(listMappings.length >= 2)
})

test('round-trip: paragraph through spans', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const doc = s.node('doc', null, [
    s.node('paragraph', { isAmgBlock: true }, [s.text('Hello world')]),
  ])
  const spans = pmNodeToSpans(adapter, doc)
  const r = pmDocFromSpans(adapter, spans)
  assert.strictEqual(r.firstChild!.type.name, 'paragraph')
  assert.strictEqual(r.firstChild!.textContent, 'Hello world')
})

test('round-trip: bullet list through spans', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  // KEY INSIGHT: paragraphs inside list_items must NOT have isAmgBlock: true.
  // The paragraph is the default textblock of list_item, so it should not emit
  // its own block marker — the list_item's "within" mapping handles that.
  const doc = s.node('doc', null, [
    s.node('bullet_list', null, [
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Item one')])]),
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Item two')])]),
    ]),
  ])
  const spans = pmNodeToSpans(adapter, doc)
  const blockSpans = spans.filter((x: any) => x.type === 'block')
  assert.ok(blockSpans.length >= 2, `expected >=2 blocks, got ${blockSpans.length}`)

  const r = pmDocFromSpans(adapter, spans)
  assert.strictEqual(r.childCount, 1)
  assert.strictEqual(r.firstChild!.type.name, 'bullet_list')
  assert.strictEqual(r.firstChild!.childCount, 2)
  assert.strictEqual(r.firstChild!.child(0).firstChild!.textContent, 'Item one')
  assert.strictEqual(r.firstChild!.child(1).firstChild!.textContent, 'Item two')
})

test('round-trip: ordered list through spans', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const doc = s.node('doc', null, [
    s.node('ordered_list', null, [
      s.node('list_item', null, [s.node('paragraph', null, [s.text('First')])]),
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Second')])]),
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Third')])]),
    ]),
  ])
  const spans = pmNodeToSpans(adapter, doc)
  const r = pmDocFromSpans(adapter, spans)
  assert.strictEqual(r.firstChild!.type.name, 'ordered_list')
  assert.strictEqual(r.firstChild!.childCount, 3)
  assert.strictEqual(r.firstChild!.child(0).firstChild!.textContent, 'First')
  assert.strictEqual(r.firstChild!.child(2).firstChild!.textContent, 'Third')
})

test('round-trip: mixed content (heading + paragraph + list + paragraph)', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const doc = s.node('doc', null, [
    s.node('heading', { level: 1, isAmgBlock: true }, [s.text('Title')]),
    s.node('paragraph', { isAmgBlock: true }, [s.text('Intro.')]),
    s.node('bullet_list', null, [
      s.node('list_item', null, [s.node('paragraph', null, [s.text('A')])]),
      s.node('list_item', null, [s.node('paragraph', null, [s.text('B')])]),
    ]),
    s.node('paragraph', { isAmgBlock: true }, [s.text('End.')]),
  ])
  const r = pmDocFromSpans(adapter, pmNodeToSpans(adapter, doc))
  assert.strictEqual(r.childCount, 4)
  assert.strictEqual(r.child(0).type.name, 'heading')
  assert.strictEqual(r.child(1).type.name, 'paragraph')
  assert.strictEqual(r.child(2).type.name, 'bullet_list')
  assert.strictEqual(r.child(2).childCount, 2)
  assert.strictEqual(r.child(3).type.name, 'paragraph')
})

test('full Automerge round-trip: updateSpans -> spans -> pmDocFromSpans', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const path = ['text']
  let doc = Automerge.from<{ text: string }>({ text: '' } as any)

  const pmDoc = s.node('doc', null, [
    s.node('paragraph', { isAmgBlock: true }, [s.text('Before')]),
    s.node('bullet_list', null, [
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Item 1')])]),
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Item 2')])]),
    ]),
    s.node('paragraph', { isAmgBlock: true }, [s.text('After')]),
  ])

  doc = Automerge.change(doc, d => {
    am.updateSpans(d, path, pmNodeToSpans(adapter, pmDoc), adapter.updateSpansConfig())
  })

  const r = pmDocFromSpans(adapter, am.spans(doc, path))
  assert.strictEqual(r.childCount, 3)
  assert.strictEqual(r.child(0).textContent, 'Before')
  assert.strictEqual(r.child(1).type.name, 'bullet_list')
  assert.strictEqual(r.child(1).childCount, 2)
  assert.strictEqual(r.child(1).child(0).firstChild!.textContent, 'Item 1')
  assert.strictEqual(r.child(1).child(1).firstChild!.textContent, 'Item 2')
  assert.strictEqual(r.child(2).textContent, 'After')
})

test('Automerge round-trip: bold + italic marks preserved', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const path = ['text']
  let doc = Automerge.from<{ text: string }>({ text: '' } as any)

  const pmDoc = s.node('doc', null, [
    s.node('paragraph', { isAmgBlock: true }, [
      s.text('Hello '),
      s.text('bold', [s.marks.strong.create()]),
      s.text(' and '),
      s.text('italic', [s.marks.em.create()]),
      s.text(' text.'),
    ]),
  ])
  doc = Automerge.change(doc, d => {
    am.updateSpans(d, path, pmNodeToSpans(adapter, pmDoc), adapter.updateSpansConfig())
  })

  const r = pmDocFromSpans(adapter, am.spans(doc, path))
  assert.strictEqual(r.firstChild!.textContent, 'Hello bold and italic text.')

  let foundBold = false, foundItalic = false
  r.firstChild!.forEach(child => {
    if (child.text === 'bold') foundBold = child.marks.some(m => m.type.name === 'strong')
    if (child.text === 'italic') foundItalic = child.marks.some(m => m.type.name === 'em')
  })
  assert.ok(foundBold, 'bold mark should be preserved')
  assert.ok(foundItalic, 'italic mark should be preserved')
})

test('DraftDocHandle adapter works', () => {
  const draft = Draft.create('spike-test', createAuthorId())
  const handle = new DraftDocHandle(draft)
  assert.ok(handle.docSync())
  handle.change((d: any) => { am.splice(d, ['text'], 0, 0, 'Hello!') })
  assert.ok(draft.text.includes('Hello!'))
})

test('full integration: DraftDocHandle + lists + bold', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const path = ['text']

  const draft = Draft.create('integration', createAuthorId())
  const handle = new DraftDocHandle(draft)

  const pmDoc = s.node('doc', null, [
    s.node('heading', { level: 2, isAmgBlock: true }, [s.text('Shopping')]),
    s.node('bullet_list', null, [
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Apples')])]),
      s.node('list_item', null, [s.node('paragraph', null, [
        s.text('Bananas ('),
        s.text('organic', [s.marks.strong.create()]),
        s.text(')'),
      ])]),
      s.node('list_item', null, [s.node('paragraph', null, [s.text('Cherries')])]),
    ]),
    s.node('paragraph', { isAmgBlock: true }, [s.text('Bring bags!')]),
  ])

  handle.change((d: any) => {
    am.updateSpans(d, path, pmNodeToSpans(adapter, pmDoc), adapter.updateSpansConfig())
  })

  const r = pmDocFromSpans(adapter, am.spans(handle.docSync()!, path))
  assert.strictEqual(r.childCount, 3)
  assert.strictEqual(r.child(0).type.name, 'heading')
  assert.strictEqual(r.child(0).attrs.level, 2)

  const list = r.child(1)
  assert.strictEqual(list.type.name, 'bullet_list')
  assert.strictEqual(list.childCount, 3)
  assert.strictEqual(list.child(0).firstChild!.textContent, 'Apples')
  assert.strictEqual(list.child(1).firstChild!.textContent, 'Bananas (organic)')

  let foundBold = false
  list.child(1).firstChild!.forEach(child => {
    if (child.text === 'organic') foundBold = child.marks.some(m => m.type.name === 'strong')
  })
  assert.ok(foundBold, 'bold on "organic" survives round-trip')
  assert.strictEqual(r.child(2).textContent, 'Bring bags!')
})

test('concurrent edits to list items merge correctly', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const path = ['text']

  let doc1 = Automerge.from<{ text: string }>({ text: '' } as any, 'aaaa0000aaaa0000')
  doc1 = Automerge.change(doc1, d => {
    am.updateSpans(d, path, pmNodeToSpans(adapter, s.node('doc', null, [
      s.node('bullet_list', null, [
        s.node('list_item', null, [s.node('paragraph', null, [s.text('Item A')])]),
        s.node('list_item', null, [s.node('paragraph', null, [s.text('Item B')])]),
      ]),
    ])), adapter.updateSpansConfig())
  })

  let doc2 = Automerge.clone(doc1, 'bbbb0000bbbb0000')

  doc1 = Automerge.change(doc1, d => {
    const spans = am.spans(d, path)
    let idx = 0
    for (const span of spans) {
      if (span.type === 'text' && span.value === 'Item A') {
        am.splice(d, path, idx + span.value.length, 0, ' (updated)')
        break
      }
      idx += span.type === 'text' ? span.value.length : 1
    }
  })

  doc2 = Automerge.change(doc2, d => {
    const spans = am.spans(d, path)
    let idx = 0
    for (const span of spans) {
      if (span.type === 'text' && span.value === 'Item B') {
        am.splice(d, path, idx + span.value.length, 0, ' (also)')
        break
      }
      idx += span.type === 'text' ? span.value.length : 1
    }
  })

  const merged = Automerge.merge(Automerge.clone(doc1), doc2)
  const r = pmDocFromSpans(adapter, am.spans(merged, path))
  assert.strictEqual(r.firstChild!.type.name, 'bullet_list')
  assert.strictEqual(r.firstChild!.childCount, 2)
  assert.ok(r.firstChild!.child(0).textContent.includes('Item A (updated)'))
  assert.ok(r.firstChild!.child(1).textContent.includes('Item B (also)'))
})

test('comment marks survive round-trip', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const path = ['text']
  let doc = Automerge.from<{ text: string }>({ text: '' } as any)

  const pmDoc = s.node('doc', null, [
    s.node('paragraph', { isAmgBlock: true }, [
      s.text('This is '),
      s.text('commented', [s.marks.comment.create({ id: 'c123' })]),
      s.text(' here.'),
    ]),
  ])

  doc = Automerge.change(doc, d => {
    am.updateSpans(d, path, pmNodeToSpans(adapter, pmDoc), adapter.updateSpansConfig())
  })

  const r = pmDocFromSpans(adapter, am.spans(doc, path))
  assert.strictEqual(r.firstChild!.textContent, 'This is commented here.')

  let found = false
  r.firstChild!.forEach(child => {
    if (child.text === 'commented') {
      const m = child.marks.find(m => m.type.name === 'comment')
      if (m) { found = true; assert.strictEqual(m.attrs.id, 'c123') }
    }
  })
  assert.ok(found, 'comment mark with id should survive')
})

test('blockquote nesting round-trips through Automerge', () => {
  const adapter = new SchemaAdapter(upwellSchema)
  const s = adapter.schema
  const path = ['text']
  let doc = Automerge.from<{ text: string }>({ text: '' } as any)

  const pmDoc = s.node('doc', null, [
    s.node('paragraph', { isAmgBlock: true }, [s.text('Normal')]),
    s.node('blockquote', null, [
      s.node('paragraph', { isAmgBlock: true }, [s.text('Quoted')]),
    ]),
  ])

  doc = Automerge.change(doc, d => {
    am.updateSpans(d, path, pmNodeToSpans(adapter, pmDoc), adapter.updateSpansConfig())
  })

  const r = pmDocFromSpans(adapter, am.spans(doc, path))
  assert.strictEqual(r.childCount, 2)
  assert.strictEqual(r.child(0).textContent, 'Normal')
  assert.strictEqual(r.child(1).type.name, 'blockquote')
  assert.strictEqual(r.child(1).firstChild!.textContent, 'Quoted')
})

// ============================================================
// Summary
// ============================================================

console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
