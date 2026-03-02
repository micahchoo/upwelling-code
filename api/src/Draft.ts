import { nanoid } from 'nanoid'
import * as Automerge from '@automerge/automerge'
import { Upwell, Author, AuthorId } from './Upwell'
import { Comments, createAuthorId, CommentState } from '.'
import { CollectionHost } from './Collection'
import { DraftDoc, Heads } from './types'

// No-op: the new @automerge/automerge auto-initializes WASM
export async function loadForTheFirstTimeLoL() {
  return Promise.resolve()
}

export type ChangeMetadata = {
  message: string
  authorId: AuthorId
}

export type DraftMetadata = {
  id: string
  heads: string[]
  initialHeads: string[]
  contributors: string[]
  title: string
  text: string
  time: number
  marks: any
  comments: any
  shared: boolean
  edited_at: number
  merged_at: number
  parent_id: string
  authorId: AuthorId
  message: string
}

export type Subscriber = (doc: Draft) => void

export class LazyDraft {
  binary: Buffer
  id: string
  constructor(id: string, binary: Buffer) {
    this.binary = binary
    this.id = id
  }

  hydrate() {
    return new Draft(this.id, Automerge.load<DraftDoc>(this.binary))
  }
}

export class Draft implements CollectionHost {
  id: string
  doc: Automerge.Doc<DraftDoc>
  comments: Comments
  _heads?: Heads = []
  _textCache?: string
  subscriber: Subscriber = () => {}

  constructor(id: string, doc: Automerge.Doc<DraftDoc>, heads?: Heads) {
    this.id = id
    this.doc = doc
    this.comments = new Comments(this, 'comments')
    this._heads = heads
  }

  // CollectionHost interface: allows Collection/Comments to update our doc
  updateDoc(doc: Automerge.Doc<any>): void {
    this.doc = doc
  }

  private _view(): DraftDoc {
    if (this._heads && this._heads.length > 0) {
      return Automerge.view(this.doc, this._heads)
    }
    return this.doc
  }

  private _getAutomergeText(prop: string): string {
    let view = this._view()
    return (view as any)[prop] || ''
  }

  _getValue(prop: string, heads?: string[]) {
    if (heads && heads.length > 0) {
      let view = Automerge.view(this.doc, heads as Heads)
      return (view as any)[prop]
    }
    let view = this._view()
    return (view as any)[prop]
  }

  get initialHeads() {
    let initialHeads = this._getValue('initialHeads') as string
    if (initialHeads) return initialHeads.split(',')
    else return Automerge.getHeads(this.doc)
  }

  get shared() {
    return this._getValue('shared') as boolean
  }

  get contributors(): string[] {
    let contribMap = this._view().contributors
    if (!contribMap) return []
    return Object.keys(contribMap)
  }

  set shared(value: boolean) {
    this.doc = Automerge.change(this.doc, d => {
      d.shared = value
    })
  }

  get created_at(): number {
    return this._getValue('time') as number
  }

  set created_at(value: number) {
    this.doc = Automerge.change(this.doc, d => {
      d.time = value
    })
  }

  get edited_at(): number {
    return this._getValue('edited_at') as number
  }

  set edited_at(value: number) {
    this.doc = Automerge.change(this.doc, d => {
      d.edited_at = value
    })
  }

  get merged_at(): number {
    return this._getValue('merged_at') as number
  }

  set merged_at(value: number) {
    this.doc = Automerge.change(this.doc, d => {
      (d as any).merged_at = value
    })
  }

  get message(): string {
    let msg = this._getValue('message') as string
    if (msg === undefined) return 'Undefined'
    if (msg.startsWith(Upwell.SPECIAL_UNNAMED_SLUG)) return 'Untitled draft'
    else return msg
  }

  set message(value: string) {
    this.doc = Automerge.change(this.doc, d => {
      d.message = value
    })
  }

  get text(): string {
    return this._getAutomergeText('text')
  }

  get authorId(): AuthorId {
    return this._getValue('author') as AuthorId
  }

  set title(value: string) {
    this.doc = Automerge.change(this.doc, d => {
      d.title = value
    })
  }

  get title(): string {
    return this._getValue('title') as string
  }

  get parent_id(): string {
    return this._getValue('parent_id') as string
  }

  set parent_id(value: string) {
    this.doc = Automerge.change(this.doc, d => {
      d.parent_id = value
    })
  }

  subscribe(subscriber: Subscriber) {
    this.subscriber = subscriber
  }

  checkout(heads: Heads) {
    return new Draft(this.id, Automerge.clone(this.doc), heads)
  }

  materialize(heads?: Heads): DraftMetadata {
    if (heads) {
      let draft = this.checkout(heads)
      return draft.materialize()
    }
    return {
      id: this.id,
      title: this.title,
      heads: heads || Automerge.getHeads(this.doc),
      initialHeads: this.initialHeads,
      parent_id: this.parent_id,
      text: this.text,
      contributors: this.contributors,
      message: this.message,
      time: this.created_at,
      edited_at: this.edited_at,
      merged_at: this.merged_at,
      shared: this.shared,
      marks: this.marks,
      comments: this.comments.objects(),
      authorId: this.authorId,
    }
  }

  insertAt(position: number, value: string | Array<string>, prop = 'text') {
    delete this._textCache
    let text = typeof value === 'string' ? value : value.join('')
    this.doc = Automerge.change(this.doc, d => {
      Automerge.splice(d, [prop], position, 0, text)
    })
  }

  insertBlock(position: number, type: string, attributes: any = {}) {
    delete this._textCache
    let block: any = { type }
    Object.keys(attributes).forEach((key) => {
      block[`attribute-${key}`] = attributes[key]
    })
    this.doc = Automerge.change(this.doc, d => {
      Automerge.splitBlock(d, ['text'], position, block)
    })
  }

  getBlock(position: number) {
    try {
      let block = Automerge.block(this.doc, ['text'], position)
      if (block) {
        let result: any = { ...block }
        result.attributes = {}
        for (let attr of Object.keys(result)) {
          if (attr.indexOf('attribute-') === 0) {
            result.attributes[attr.substring(10)] = result[attr]
            delete result[attr]
          }
        }
        return result
      }
    } catch (e) {
      return undefined
    }
    return undefined
  }

  setBlock(position: number, type: string, attributes: any) {
    if (!this.getBlock(position))
      throw new Error(
        `unable to modify block, position ${position} is not a block!`
      )
    delete this._textCache
    this.doc = Automerge.change(this.doc, d => {
      let block: any = { type }
      Object.keys(attributes || {}).forEach((key) => {
        block[`attribute-${key}`] = attributes[key]
      })
      Automerge.updateBlock(d, ['text'], position, block)
    })
  }

  insertComment(
    from: number,
    to: number,
    message: string,
    authorId: string
  ): string {
    let comment_id = nanoid()
    let comment = {
      id: comment_id,
      author: authorId,
      message,
      children: [] as string[],
      state: CommentState.OPEN,
    }

    this.comments.insert(comment)
    this.mark('comment', `[${from}..${to}]`, comment_id)

    return comment_id
  }

  deleteAt(position: number, count: number = 1, prop = 'text') {
    delete this._textCache
    this.doc = Automerge.change(this.doc, d => {
      Automerge.splice(d, [prop], position, count)
    })
  }

  mark(name: string, range: string, value: any, prop = 'text') {
    // Parse range like "[3..8]" or "(3..8)"
    let match = range.match(/([[(])(\d+)\.\.(\d+)([\])])/)
    if (!match) throw new Error('Invalid range: ' + range)
    let start = parseInt(match[2])
    let end = parseInt(match[3])
    // '(' means expand, '[' means don't expand
    let expand = match[1] === '(' ? 'after' as const : 'none' as const

    this.doc = Automerge.change(this.doc, d => {
      Automerge.mark(d, [prop], { start, end, expand }, name, value)
    })
  }

  getMarks(prop = 'text') {
    let marks = Automerge.marks(this.doc, [prop])
    // Convert from new format {name, value, start, end} to old format {type, value, start, end, id}
    let filteredSpans: any[] = []

    let spanCollector: any = {
      strong: new Array(this.text.length).fill(false, 0, this.text.length),
      italic: new Array(this.text.length).fill(false, 0, this.text.length),
    }
    let spanActors: any = {
      strong: new Array(this.text.length),
      italic: new Array(this.text.length),
    }

    for (let mark of marks) {
      let span: any = {
        type: mark.name,
        value: mark.value,
        start: mark.start,
        end: mark.end,
      }
      if (!spanCollector[mark.name]) {
        filteredSpans.push(span)
        continue
      }
      spanCollector[mark.name].fill(mark.value, mark.start, mark.end)
    }

    for (let type of Object.keys(spanCollector)) {
      let spanOffsets = spanCollector[type]
      let idx = 0
      while (true) {
        let start = spanOffsets.indexOf(true, idx)
        if (start === -1) break
        let end = spanOffsets.indexOf(false, start + 1)
        if (end === -1) break
        filteredSpans.push({
          start,
          end,
          type,
          value: true,
        })
        idx = end + 1
      }
    }

    return filteredSpans
  }

  get marks() {
    return this.getMarks()
  }

  get blocks() {
    let blocks: any[] = []
    let text = this.text
    let i = text.indexOf('\uFFFC')

    // If we have an empty document, insert a paragraph to get started.
    if (i === -1) {
      this.insertBlock(0, 'paragraph')
      text = this.text
      i = text.indexOf('\uFFFC')
    }

    while (i !== text.length) {
      let start = i + 1
      let end = text.indexOf('\uFFFC', i + 1)
      if (end === -1) end = text.length

      let attrs = this.getBlock(i)
      if (!attrs)
        throw new Error(`unable to retrieve block information at position ${i}`)
      let block = { start, end, ...attrs }
      blocks.push(block)
      i = end
    }

    return blocks
  }

  save(): Uint8Array {
    return Automerge.save(this.doc)
  }

  fork(message: string, author: Author): Draft {
    let id = nanoid()
    let doc = Automerge.clone(this.doc, { actor: Draft.getActorId(author.id) })
    doc = Automerge.change(doc, d => {
      d.initialHeads = Automerge.getHeads(this.doc).join(',')
      d.message = message
      d.author = author.id.toString()
      d.shared = false
      d.time = Date.now()
      ;(d as any).merged_at = false
      d.edited_at = Date.now()
      d.archived = false
      d.comments = {} as any
      d.contributors = {} as any
      d.parent_id = this.id
    })
    let draft = new Draft(id, doc)
    draft.addContributor(author.id.toString())
    return draft
  }

  addContributor(authorId: AuthorId) {
    let contribs = this.doc.contributors
    if (contribs && contribs[authorId] === true) return
    this.doc = Automerge.change(this.doc, d => {
      d.contributors[authorId] = true
    })
  }

  merge(theirs: Draft): string[] {
    let beforeHeads = Automerge.getHeads(this.doc)
    this.doc = Automerge.merge(this.doc, theirs.doc)
    let afterHeads = Automerge.getHeads(this.doc)
    // Return the new heads that appeared (as a proxy for opIds)
    let newHeads = afterHeads.filter(h => !beforeHeads.includes(h))
    if (this.subscriber) this.subscriber(this)
    return newHeads
  }

  static getActorId(authorId: AuthorId) {
    return authorId + '0000' + createAuthorId()
  }

  static load(id: string, binary: Uint8Array, authorId: AuthorId): Draft {
    let doc = Automerge.load<DraftDoc>(binary, { actor: this.getActorId(authorId) })
    let draft = new Draft(id, doc)
    return draft
  }

  static create(message: string, authorId: AuthorId): Draft {
    let id = nanoid()
    let actorId = this.getActorId(authorId)
    let doc = Automerge.from<DraftDoc>({
      text: '',
      title: '',
      message,
      author: authorId,
      shared: false,
      pinned: false,
      parent_id: id,
      time: Date.now(),
      archived: false,
      edited_at: 0,
      merged_at: false,
      initialHeads: '',
      contributors: {},
      comments: {},
    } as DraftDoc, { actor: actorId })
    let draft = new Draft(id, doc)
    draft.addContributor(authorId)
    return draft
  }

  commit(message: string): Heads {
    let meta: ChangeMetadata = { authorId: this.authorId, message }
    this.doc = Automerge.change(this.doc, { message: JSON.stringify(meta) }, _d => {
      // Empty change body — just creating a commit point with a message
    })
    let heads = Automerge.getHeads(this.doc)
    if (this.subscriber) this.subscriber(this)
    return heads
  }
}
