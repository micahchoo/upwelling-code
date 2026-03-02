import * as Automerge from '@automerge/automerge'
import { v4 as uuid } from 'uuid'

type CollectionRow = {
  id?: string
}

// A Collection stores objects in a map field on a Draft's Automerge doc.
// Since the new Automerge API is immutable, the Collection needs a reference
// to its parent Draft so it can read/write through the draft's doc.
export interface CollectionHost {
  doc: Automerge.Doc<any>
  updateDoc(doc: Automerge.Doc<any>): void
}

export class Collection<T extends CollectionRow> {
  name: string
  host: CollectionHost

  constructor(host: CollectionHost, name: string) {
    this.name = name
    this.host = host
    // Ensure the collection map exists
    let doc = this.host.doc
    if (!(doc as any)[name]) {
      this.host.updateDoc(
        Automerge.change(doc, d => {
          ;(d as any)[name] = {}
        })
      )
    }
  }

  private _getMap(): { [key: string]: T } {
    return (this.host.doc as any)[this.name] || {}
  }

  objects(): { [key: string]: T } {
    let map = this._getMap()
    // Return a plain JS copy
    return JSON.parse(JSON.stringify(map))
  }

  insert(data: T): string {
    let id = data.id || uuid()
    data.id = id
    this.host.updateDoc(
      Automerge.change(this.host.doc, d => {
        let collection = (d as any)[this.name]
        if (!collection[id]) {
          collection[id] = {} as any
        }
        let obj = collection[id]
        Object.keys(data).forEach((key) => {
          if (typeof (data as any)[key] === 'object' && Array.isArray((data as any)[key])) {
            obj[key] = (data as any)[key].slice()
          } else {
            obj[key] = (data as any)[key]
          }
        })
      })
    )
    return id
  }

  get(id: string): T | undefined {
    let map = this._getMap()
    let value = map[id]
    if (value) {
      return JSON.parse(JSON.stringify(value))
    }
    return undefined
  }

  update(id: string, raw: any) {
    let data = this.get(id)
    if (!data) throw new Error('id doesnt exist')
    return this.insert(Object.assign(data, raw))
  }
}
