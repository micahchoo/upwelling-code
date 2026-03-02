import { EventEmitter } from "events";
import { nanoid } from "nanoid";
import * as Automerge from '@automerge/automerge';
import { Author } from "..";

import debug from 'debug'

const log = debug('RTC')

const STORAGE_URL = process.env.STORAGE_URL;
console.log(STORAGE_URL);

const MAX_RETRIES = 5;

export type CursorPosition = {
  start: number,
  end: number
}

export type WebsocketSyncMessage = {
  method: string;
  peerId: string;
  message?: string;
  author: Author;
};

export default class RTC<T extends WebsocketSyncMessage> extends EventEmitter {
  id: string;
  ws: WebSocket;
  doc: Automerge.Doc<any>;
  author: Author;
  destroyed: boolean = false;
  timeout: any;
  peerId: string = nanoid();
  peerStates = new Map<string, Automerge.SyncState>();
  retries: number = 0;

  constructor(id: string, doc: Automerge.Doc<any>, author: Author) {
    super()
    this.id = id
    this.doc = doc
    this.author = author
    this.ws = this.connect();
  }

  retry() {
    this.retries++;
    let sec = this.retries * 3000
    log(`Retrying in ${sec}ms`)
    this.timeout = setTimeout(() => {
      this.ws = this.connect();
    }, sec);
  }

  _getPeerState(peerId: string): Automerge.SyncState {
    let state = this.peerStates.get(peerId);
    if (!state) {
      state = Automerge.initSyncState();
      this.peerStates.set(peerId, state);
    }
    return state;
  }

  receiveSyncMessage(msg: WebsocketSyncMessage) {
    let state = this._getPeerState(msg.peerId);
    if (!msg.message) {
      console.error("msg", msg);
      throw new Error("Malformed syncMessage");
    }
    let syncMessage = Uint8Array.from(Buffer.from(msg.message, "base64"));
    let heads = Automerge.getHeads(this.doc);
    let [newDoc, newState, _patches] = Automerge.receiveSyncMessage(this.doc, state, syncMessage);
    this.doc = newDoc;
    this.peerStates.set(msg.peerId, newState);
    let newHeads = Automerge.getHeads(this.doc);
    // Changed heads serve as a proxy for op IDs
    let opIds = newHeads.filter(h => !heads.includes(h));
    this.emit('syncMessage', { heads, msg, opIds })
    this.sendSyncMessage(msg.peerId);
  }

  updatePeers() {
    let peers = this.peerStates.keys();

    for (let peerId of peers) {
      this.sendSyncMessage(peerId);
    }
  }


  sendSyncMessage(peerId: string) {
    let state = this._getPeerState(peerId);
    let [newState, syncMessage] = Automerge.generateSyncMessage(this.doc, state);
    this.peerStates.set(peerId, newState);
    if (!syncMessage) return; // done
    let msg = {
      peerId: this.peerId,
      author: this.author,
      method: "MESSAGE",
      message: Buffer.from(syncMessage).toString("base64"),
    };
    this.send(msg as T);
  }


  send(msg: T) {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
    }
  }

  sendOpen() {
    log('Opened', this.id)
    this.send({
      author: this.author,
      peerId: this.peerId,
      method: "OPEN",
    } as T);
  }

  connect() {
    if (!STORAGE_URL) throw new Error("no storage url");
    var httpProtocol = "http://";
    var wsProtocol = "ws://";
    if (window.location.protocol === "https:") {
      httpProtocol = "https://";
      wsProtocol = "wss://";
    }
    let url = STORAGE_URL.replace(httpProtocol, wsProtocol);
    url = `${url}/${this.id}/connect/${this.peerId}`;
    let ws = new WebSocket(url);
    log('connecting to', this.id)
    ws.onopen = () => {
      this.sendOpen();
      if (this.timeout) clearTimeout(this.timeout);
    };
    ws.onmessage = (msg) => {
      let value;
      try {
        value = JSON.parse(msg.data);
      } catch (err) {
        console.error("Invalid Websocket Message", msg);
        console.error("Original error", err);
        return;
      }
      switch (value.method) {
        case "OPEN":
          this.emit('peer', value)
          this.sendSyncMessage(value.peerId);
          break;
        case "MESSAGE":
          this.receiveSyncMessage(value);
          break;
        case "BYE":
          log('BYE', value)
          this.emit('peer-disconnect', value)
          break;
        default:
          this.emit('message', value)
      }
    };


    ws.onclose = () => {
      console.log('ws closed')
      if (!this.destroyed) this.retry()
    };
    return ws;
  }

  destroy() {
    let msg = {
      author: this.author,
      peerId: this.peerId,
      method: "BYE",
    };
    this.send(msg as T);
    this.destroyed = true
    this.ws.close();
  }

}
