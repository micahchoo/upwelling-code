// Types for Automerge document schemas and change tracking
import * as Automerge from '@automerge/automerge'

// ChangeSet types - replaces the types previously exported by automerge-wasm-pack
// Used for tracking text attribution in the ProseMirror integration
export type ChangeSetAddition = { actor: string; start: number; end: number }
export type ChangeSetDeletion = { actor: string; pos: number; val: string }
export type ChangeSet = { add: ChangeSetAddition[]; del: ChangeSetDeletion[] }

// Automerge document schemas

export interface DraftDoc {
  [key: string]: unknown
  text: string
  title: string
  message: string
  author: string
  shared: boolean
  pinned: boolean
  parent_id: string
  time: number
  archived: boolean
  edited_at: number
  merged_at: number | false
  initialHeads: string
  contributors: { [key: string]: boolean }
  comments: { [key: string]: CommentDoc }
}

export interface CommentDoc {
  id: string
  author: string
  message: string
  children: string[]
  parentId?: string
  state: number
}

export interface DraftMetaEntry {
  id: string
  heads: string[]
  initialHeads: string[]
  archived: boolean
  shared?: boolean
}

export interface MetadataDoc {
  [key: string]: unknown
  id: string
  main: string
  drafts: { [key: string]: DraftMetaEntry }
  history: string[]
  authors: AuthorEntry[]
}

export interface AuthorEntry {
  id: string
  name: string
  date?: number
}

export type Heads = Automerge.Heads

// Convert Automerge.Patch[] from diff() into our ChangeSet format
// Used as a bridge for the ProseMirror integration which expects ChangeSets
export function patchesToChangeSet(patches: Automerge.Patch[], actor: string): ChangeSet {
  let changeSet: ChangeSet = { add: [], del: [] }
  for (let patch of patches) {
    if (patch.action === 'splice' && patch.path[0] === 'text') {
      let start = patch.path[1] as number
      let text = (patch as any).value as string
      if (text) {
        changeSet.add.push({
          actor,
          start,
          end: start + text.length,
        })
      }
    } else if (patch.action === 'del' && patch.path[0] === 'text') {
      let pos = patch.path[1] as number
      changeSet.del.push({
        actor,
        pos,
        val: '', // diff doesn't provide deleted text content
      })
    }
  }
  return changeSet
}
