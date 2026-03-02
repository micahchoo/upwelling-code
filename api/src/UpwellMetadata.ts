import * as Automerge from '@automerge/automerge'
import { Draft, Author, AuthorId, DraftMetadata } from '.'
import colors from './colors'
import { MetadataDoc, AuthorEntry, DraftMetaEntry } from './types'

export class UpwellMetadata {
  doc: Automerge.Doc<MetadataDoc>

  constructor(doc: Automerge.Doc<MetadataDoc>) {
    if (!doc) throw new Error('doc required')
    this.doc = doc
  }

  static load(binary: Uint8Array): UpwellMetadata {
    return new UpwellMetadata(Automerge.load<MetadataDoc>(binary))
  }

  static create(id: string): UpwellMetadata {
    let doc = Automerge.from<MetadataDoc>({
      id,
      main: '',
      drafts: {},
      history: [],
      authors: [],
    })
    let meta = new UpwellMetadata(doc)
    return meta
  }

  isArchived(id: string): boolean {
    let draft = this.doc.drafts[id]
    return draft ? draft.archived : false
  }

  archive(id: string) {
    let draft = this.doc.drafts[id]
    if (!draft) return
    this.doc = Automerge.change(this.doc, d => {
      d.drafts[id] = {
        id: draft.id,
        heads: draft.heads ? [...draft.heads] : [],
        initialHeads: draft.initialHeads ? [...draft.initialHeads] : [],
        archived: true,
      } as any
    })
  }

  addDraft(draft: Draft) {
    let draftMetadata = draft.materialize()
    let archived = false
    try {
      archived = this.isArchived(draft.id)
    } catch (e) {}
    this.doc = Automerge.change(this.doc, d => {
      d.drafts[draft.id] = {
        id: draft.id,
        heads: [...draftMetadata.heads],
        initialHeads: [...draftMetadata.initialHeads],
        archived,
        shared: draft.shared,
      } as any
    })
  }

  getDraft(id: string): DraftMetaEntry {
    let draft = this.doc.drafts[id]
    if (!draft) throw new Error('Draft not found: ' + id)
    return JSON.parse(JSON.stringify(draft))
  }

  addAuthor(author: Author) {
    let authors = this.doc.authors || []
    if (authors.findIndex((a: AuthorEntry) => a.id === author.id) !== -1) return
    this.doc = Automerge.change(this.doc, d => {
      d.authors.push({ id: author.id, name: author.name, date: Date.now() } as any)
    })
  }

  updateAuthor(id: AuthorId, name: string) {
    let authors = this.doc.authors || []
    let index = authors.findIndex((a: AuthorEntry) => a.id === id)
    if (index === -1) return
    this.doc = Automerge.change(this.doc, d => {
      d.authors[index].name = name
    })
  }

  getAuthors(): AuthorEntry[] {
    return JSON.parse(JSON.stringify(this.doc.authors || []))
  }

  getAuthor(authorId: AuthorId): AuthorEntry | undefined {
    let authors = this.doc.authors || []
    return authors.find((a: AuthorEntry) => a.id === authorId)
  }

  getAuthorColor(authorId: AuthorId): string {
    let authors = this.getAuthors()
    let index = authors.findIndex((author: AuthorEntry) => author.id === authorId)
    return colors[Math.max(index % colors.length, 0)]
  }

  get id(): string {
    return this.doc.id || ''
  }

  get main(): string {
    if (!this.doc.main) throw new Error('no main doc')
    return this.doc.main
  }

  set main(id: string) {
    this.doc = Automerge.change(this.doc, d => {
      d.main = id
    })
  }

  addToHistory(id: string) {
    this.doc = Automerge.change(this.doc, d => {
      d.history.push(id as any)
    })
  }
}
