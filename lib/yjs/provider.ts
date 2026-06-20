import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PresenceUser } from '@/lib/presence'
import { fromBase64, toBase64 } from './encoding'
import { loadSnapshot, saveSnapshot } from './snapshot'

type Supabase = SupabaseClient<Database>

export type ProviderStatus = 'connecting' | 'synced' | 'offline'

export type KoreProviderOptions = {
  supabase: Supabase
  ydoc: Y.Doc
  awareness: Awareness
  docType: string
  docId: string
  workspaceId: string
  presenceUser: PresenceUser
  onStatus?: (status: ProviderStatus) => void
  onPresence?: (users: PresenceUser[]) => void
}

// Broadcast event names
const EV_UPDATE = 'y-update' // payload { b }            incremental Yjs update
const EV_AWARENESS = 'awareness' // payload { b }         awareness update
const EV_STATE_REQ = 'state-request' // payload { sv, from }
const EV_STATE_RES = 'state-reply' // payload { to, b }   missing-updates diff
const EV_CHUNK = 'chunk' // payload { cid, i, n, event, extra, b }

const CHUNK_LIMIT = 100_000 // base64 chars/msg (broadcast cap ~256 KB)
const SNAPSHOT_DEBOUNCE = 2500
const RECONCILE_INTERVAL = 25_000

// Sentinel origin: updates we apply from the network are tagged REMOTE so the
// local update handler never re-broadcasts them (and we never loop).
const REMOTE = Symbol('kore-remote')

type ChunkBuffer = {
  n: number
  parts: string[]
  received: number
  event: string
  extra: Record<string, unknown>
}

/**
 * A Yjs provider over a Supabase Realtime *private broadcast* channel, plus
 * Supabase Presence (who's-online) and y-awareness (live cursors).
 *
 * Correctness rests on the CRDT guarantee: Yjs updates are commutative and
 * idempotent, so order and duplicates don't matter. See lib/yjs/README intent
 * in CLAUDE.md and the plan's failure-mode table.
 */
export class KoreYjsProvider {
  private opts: KoreProviderOptions
  private channel: RealtimeChannel
  private buffering = true
  private pending: Uint8Array[] = []
  private chunks = new Map<string, ChunkBuffer>()
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null
  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private destroyed = false
  private chunkSeq = 0

  constructor(opts: KoreProviderOptions) {
    this.opts = opts
    const topic = `doc:${opts.workspaceId}:${opts.docType}:${opts.docId}`
    this.channel = opts.supabase.channel(topic, {
      config: {
        private: true,
        broadcast: { self: false, ack: false },
        presence: { key: opts.presenceUser.id },
      },
    })

    opts.ydoc.on('update', this.handleLocalUpdate)
    opts.awareness.on('update', this.handleAwarenessUpdate)

    void this.connect()
  }

  // --- connection / lifecycle ----------------------------------------------

  private setStatus(status: ProviderStatus) {
    this.opts.onStatus?.(status)
  }

  private async connect() {
    const { supabase } = this.opts
    // Make Realtime use the current user's JWT so private-channel RLS passes.
    // setAuth is async in realtime-js — MUST await before subscribe(), or the
    // private-channel join hangs at "connecting".
    const { data } = await supabase.auth.getSession()
    await supabase.realtime.setAuth(data.session?.access_token ?? null)

    this.channel
      .on('broadcast', { event: EV_UPDATE }, ({ payload }) => this.onUpdate(payload))
      .on('broadcast', { event: EV_AWARENESS }, ({ payload }) => this.onAwareness(payload))
      .on('broadcast', { event: EV_STATE_REQ }, ({ payload }) => this.onStateRequest(payload))
      .on('broadcast', { event: EV_STATE_RES }, ({ payload }) => this.onStateReply(payload))
      .on('broadcast', { event: EV_CHUNK }, ({ payload }) => this.onChunk(payload))
      .on('presence', { event: 'sync' }, () => this.emitPresence())
      .subscribe(async (status, err) => {
        if (this.destroyed) return
        if (status === 'SUBSCRIBED') {
          await this.channel.track(this.opts.presenceUser)
          await this.loadInitial()
          this.startReconcile()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (err) console.error('[kore] realtime channel error:', err.message ?? err)
          this.setStatus('offline')
        }
      })
  }

  /** (c) Initial state: buffer live updates, apply snapshot, flush, handshake. */
  private async loadInitial() {
    try {
      const snapshot = await loadSnapshot(this.opts.supabase, this.opts.docType, this.opts.docId)
      if (snapshot && !this.destroyed) Y.applyUpdate(this.opts.ydoc, snapshot, REMOTE)
    } catch {
      // ignore — the handshake below backfills from any present peer
    }

    this.buffering = false
    for (const update of this.pending) {
      try {
        Y.applyUpdate(this.opts.ydoc, update, REMOTE)
      } catch {
        // malformed/duplicate — CRDT makes this safe to skip
      }
    }
    this.pending = []

    // Ask peers for anything newer than our (possibly stale) snapshot.
    this.requestState()
    this.setStatus('synced')
  }

  async destroy() {
    if (this.destroyed) return
    if (this.reconcileTimer) clearInterval(this.reconcileTimer)
    // Announce our cursor removal while the channel is still open.
    try {
      removeAwarenessStates(this.opts.awareness, [this.opts.ydoc.clientID], 'local')
    } catch {
      // ignore
    }
    this.destroyed = true
    this.opts.ydoc.off('update', this.handleLocalUpdate)
    this.opts.awareness.off('update', this.handleAwarenessUpdate)
    await this.flushSnapshot()
    try {
      await this.opts.supabase.removeChannel(this.channel)
    } catch {
      // ignore
    }
  }

  // --- local -> network ----------------------------------------------------

  private handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return // never re-broadcast what we applied remotely
    this.broadcastBinary(EV_UPDATE, update)
    this.scheduleSnapshot()
  }

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === REMOTE) return
    const changed = [...changes.added, ...changes.updated, ...changes.removed]
    if (changed.length === 0) return
    const enc = encodeAwarenessUpdate(this.opts.awareness, changed)
    this.broadcastBinary(EV_AWARENESS, enc)
  }

  // --- network -> local ----------------------------------------------------

  private onUpdate(payload: { b: string }) {
    const bytes = fromBase64(payload.b)
    if (this.buffering) this.pending.push(bytes)
    else Y.applyUpdate(this.opts.ydoc, bytes, REMOTE)
  }

  private onAwareness(payload: { b: string }) {
    applyAwarenessUpdate(this.opts.awareness, fromBase64(payload.b), REMOTE)
  }

  private onStateRequest(payload: { sv: string; from: number }) {
    if (payload.from === this.opts.ydoc.clientID) return
    const diff = Y.encodeStateAsUpdate(this.opts.ydoc, fromBase64(payload.sv))
    this.broadcastBinary(EV_STATE_RES, diff, { to: payload.from })
  }

  private onStateReply(payload: { to: number; b: string }) {
    if (payload.to !== this.opts.ydoc.clientID) return
    Y.applyUpdate(this.opts.ydoc, fromBase64(payload.b), REMOTE)
  }

  private onChunk(payload: {
    cid: string
    i: number
    n: number
    event: string
    extra: Record<string, unknown>
    b: string
  }) {
    let entry = this.chunks.get(payload.cid)
    if (!entry) {
      entry = {
        n: payload.n,
        parts: new Array(payload.n).fill(''),
        received: 0,
        event: payload.event,
        extra: payload.extra,
      }
      this.chunks.set(payload.cid, entry)
    }
    if (entry.parts[payload.i] === '') entry.received++
    entry.parts[payload.i] = payload.b
    if (entry.received >= entry.n) {
      this.chunks.delete(payload.cid)
      this.dispatchBinary(entry.event, { ...entry.extra, b: entry.parts.join('') })
    }
  }

  private dispatchBinary(event: string, payload: Record<string, unknown>) {
    if (event === EV_UPDATE) this.onUpdate(payload as { b: string })
    else if (event === EV_AWARENESS) this.onAwareness(payload as { b: string })
    else if (event === EV_STATE_RES) this.onStateReply(payload as { to: number; b: string })
  }

  // --- broadcast helpers ---------------------------------------------------

  private broadcast(event: string, payload: Record<string, unknown>) {
    if (this.destroyed) return
    void this.channel.send({ type: 'broadcast', event, payload })
  }

  private broadcastBinary(
    event: string,
    bytes: Uint8Array,
    extra: Record<string, unknown> = {},
  ) {
    const b = toBase64(bytes)
    if (b.length <= CHUNK_LIMIT) {
      this.broadcast(event, { ...extra, b })
      return
    }
    const cid = `${this.opts.ydoc.clientID}-${this.chunkSeq++}`
    const n = Math.ceil(b.length / CHUNK_LIMIT)
    for (let i = 0; i < n; i++) {
      this.broadcast(EV_CHUNK, {
        cid,
        i,
        n,
        event,
        extra,
        b: b.slice(i * CHUNK_LIMIT, (i + 1) * CHUNK_LIMIT),
      })
    }
  }

  private requestState() {
    const sv = Y.encodeStateVector(this.opts.ydoc)
    this.broadcast(EV_STATE_REQ, { sv: toBase64(sv), from: this.opts.ydoc.clientID })
  }

  // --- reconcile + snapshot ------------------------------------------------

  private startReconcile() {
    this.reconcileTimer = setInterval(() => {
      if (!this.destroyed) this.requestState() // (failure mode) recover missed broadcasts
    }, RECONCILE_INTERVAL)
  }

  private scheduleSnapshot() {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = setTimeout(() => void this.flushSnapshot(), SNAPSHOT_DEBOUNCE)
  }

  /** Persist full doc state now. Public so the host can flush on unload. */
  async flushSnapshot() {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
    try {
      const state = Y.encodeStateAsUpdate(this.opts.ydoc)
      await saveSnapshot(
        this.opts.supabase,
        this.opts.docType,
        this.opts.docId,
        this.opts.workspaceId,
        state,
      )
    } catch {
      // ignore — next edit/flush retries; snapshot is LWW
    }
  }

  flush() {
    void this.flushSnapshot()
  }

  // --- presence ------------------------------------------------------------

  private emitPresence() {
    const state = this.channel.presenceState<PresenceUser>()
    const users: PresenceUser[] = []
    const seen = new Set<string>()
    for (const key of Object.keys(state)) {
      for (const meta of state[key]) {
        if (meta?.id && !seen.has(meta.id)) {
          seen.add(meta.id)
          users.push({
            id: meta.id,
            name: meta.name,
            color: meta.color,
            avatarUrl: meta.avatarUrl ?? null,
          })
        }
      }
    }
    this.opts.onPresence?.(users)
  }
}
