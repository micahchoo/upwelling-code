import * as Automerge from '@automerge/automerge'
import { AuthorId } from './Upwell'
import { Collection, CollectionHost } from './Collection'
import { nanoid } from 'nanoid'

export type CommentId = string
export enum CommentState {
  OPEN,
  CLOSED,
  CHILD,
}

export type Comment = {
  id: CommentId
  author: AuthorId
  message: string
  children: string[]
  parentId?: CommentId
  state: CommentState
}

export class Comments extends Collection<Comment> {
  resolve(comment: Comment) {
    this.host.updateDoc(
      Automerge.change(this.host.doc, d => {
        let c = (d as any)[this.name][comment.id]
        if (c) c.state = CommentState.CLOSED
      })
    )
  }

  addChild(message: string, author: AuthorId, parentId: CommentId): Comment {
    const id = nanoid()
    const child: Comment = {
      id,
      author,
      message,
      children: [],
      parentId,
      state: CommentState.OPEN,
    }
    this.insert(child)
    this.host.updateDoc(
      Automerge.change(this.host.doc, d => {
        let parent = (d as any)[this.name][parentId]
        if (parent && parent.children) {
          parent.children.push(child.id)
        }
      })
    )
    return child
  }
}
