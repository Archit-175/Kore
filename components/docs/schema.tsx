'use client'

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'
import { MentionChip } from './mention-chip'
import { DatabaseEmbedView } from './database-embed'
import { WhiteboardEmbedView } from './whiteboard-embed'

/**
 * The Docs editor schema = BlockNote defaults + three additions:
 *
 *  - `callout`: the ONE block from the Phase-3 spec that BlockNote doesn't ship
 *    by default (text / headings / lists / toggle / quote / code / divider are
 *    all built in). createReactBlockSpec returns a factory in 0.51.x, so it's
 *    registered as `callout: Callout()`.
 *  - `databaseEmbed` (Phase 4): a void block that embeds a standalone database by
 *    id. It stores ONLY the databaseId; the DatabaseView it mounts loads through
 *    its own DAL+RLS, so the embed can't bypass membership.
 *  - `mention`: an atomic inline content type for @-mentioning another page. It
 *    stores the target pageId (source of truth) plus a cached title/projectId
 *    for first paint; the chip resolves the live title from the title store.
 */

export const Callout = createReactBlockSpec(
  { type: 'callout', propSchema: {}, content: 'inline' },
  {
    render: (props) => (
      <div className="my-1 flex gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <span aria-hidden className="select-none pt-0.5 text-base leading-6">
          💡
        </span>
        <div className="flex-1 leading-6" ref={props.contentRef} />
      </div>
    ),
  },
)

export const DatabaseEmbed = createReactBlockSpec(
  { type: 'databaseEmbed', propSchema: { databaseId: { default: '' } }, content: 'none' },
  {
    // selectable:false makes BlockNote install stopEvent=()=>true + blur-on-mousedown
    // for this void widget, so ProseMirror can't node-select/delete the embed or
    // intercept the inner clicks / board HTML5 drag.
    meta: { selectable: false },
    render: (props) => (
      <DatabaseEmbedView
        databaseId={props.block.props.databaseId}
        onPick={(id) => props.editor.updateBlock(props.block, { props: { databaseId: id } })}
      />
    ),
  },
)

export const WhiteboardEmbed = createReactBlockSpec(
  { type: 'whiteboardEmbed', propSchema: { whiteboardId: { default: '' } }, content: 'none' },
  {
    // Same void-widget guard as databaseEmbed: selectable:false installs
    // stopEvent + blur-on-mousedown so ProseMirror can't node-select/delete the
    // embed or intercept the Excalidraw canvas's pointer/drag.
    meta: { selectable: false },
    render: (props) => (
      <WhiteboardEmbedView
        whiteboardId={props.block.props.whiteboardId}
        onPick={(id) => props.editor.updateBlock(props.block, { props: { whiteboardId: id } })}
      />
    ),
  },
)

export const PageMention = createReactInlineContentSpec(
  {
    type: 'mention',
    content: 'none',
    propSchema: {
      pageId: { default: '' },
      title: { default: '' },
      projectId: { default: '' },
    },
  },
  {
    render: (props) => {
      const { pageId, title, projectId } = props.inlineContent.props
      return <MentionChip pageId={pageId} title={title} projectId={projectId} />
    },
  },
)

// Drop BlockNote's built-in `table` block. The Phase-3 Docs spec doesn't use it,
// and its TableHandles extension (added only when "table" is in blockSpecs) attaches
// a document mousemove handler that throws ("Cannot read properties of undefined
// (reading 'rows')") when the pointer moves over the inline databaseEmbed's own
// <table> element. Excluding the block disables TableHandles entirely.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { table: _table, ...baseBlockSpecs } = defaultBlockSpecs

export const docSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...baseBlockSpecs,
    callout: Callout(),
    databaseEmbed: DatabaseEmbed(),
    whiteboardEmbed: WhiteboardEmbed(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: PageMention },
})
