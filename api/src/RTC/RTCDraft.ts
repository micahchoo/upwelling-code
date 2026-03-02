import * as Automerge from '@automerge/automerge'
import { ChangeSet, patchesToChangeSet } from '../types'
import { Author, Draft } from '..'
import Queue from '../Queue'
import RTC, { WebsocketSyncMessage } from './RTC'

export type Transaction = {
  changes?: ChangeSet[]
  author: Author
  cursor?: CursorPosition
}

export type CursorPosition = {
  start: number
  end: number
}

export interface DraftWebsocketMessage extends WebsocketSyncMessage {
  cursor?: CursorPosition
}

export class RealTimeDraft extends RTC<DraftWebsocketMessage> {
  draft: Draft
  transactions: Queue<Transaction> = new Queue()

  constructor(draft: Draft, author: Author) {
    super(draft.id, draft.doc, author)
    this.draft = draft
    this.author = author
    this.on('syncMessage', ({ heads, msg, opIds }) => {
      // Update the draft's doc reference (since RTC.receiveSyncMessage updates this.doc)
      this.draft.doc = this.doc
      this.draft.subscriber && this.draft.subscriber(this.draft)

      if (opIds.length > 0) {
        // Use diff to compute what text changed
        let newHeads = Automerge.getHeads(this.doc)
        let patches = Automerge.diff(this.doc, heads, newHeads)
        let textPatches = patches.filter(p => p.path[0] === 'text')

        if (textPatches.length > 0) {
          // Use the remote author's ID for attribution
          let actorId = msg.author?.id || ''
          let attribution = patchesToChangeSet(textPatches, actorId + '0000')
          this.transactions.push({
            author: msg.author,
            changes: [attribution],
          })
        }
      }

      if (opIds.length > 0) {
        this.emit('data')
      }
    })

    this.on('message', (value: DraftWebsocketMessage) => {
      if (value.method === 'CURSOR') {
        this.receiveCursorMessage(value)
      }
    })
  }

  receiveCursorMessage(msg: DraftWebsocketMessage) {
    this.transactions.push({
      author: msg.author,
      cursor: msg.cursor,
    })
  }

  sendCursorMessage(pos: CursorPosition) {
    this.send({
      author: this.author,
      peerId: this.peerId,
      method: 'CURSOR',
      cursor: pos,
    })
  }
}
