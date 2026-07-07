'use client'

import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'
import { DemoMentionChip } from './demo-mention-chip'
import { DemoDatabaseEmbedView } from './demo-database-embed'
import { DemoWhiteboardEmbedView } from './demo-whiteboard-embed'

/**
 * Demo BlockNote schema. Mirrors components/docs/schema.tsx but wires the DEMO
 * embed views + mention chip (store-backed, /demo routes) — and deliberately does
 * NOT import the real schema (which pulls in the Supabase-bound embed containers).
 */

export const DemoCallout = createReactBlockSpec(
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

export const DemoDatabaseEmbed = createReactBlockSpec(
  { type: 'databaseEmbed', propSchema: { databaseId: { default: '' } }, content: 'none' },
  {
    meta: { selectable: false },
    render: (props) => (
      <DemoDatabaseEmbedView
        databaseId={props.block.props.databaseId}
        onPick={(id) => props.editor.updateBlock(props.block, { props: { databaseId: id } })}
      />
    ),
  },
)

export const DemoWhiteboardEmbed = createReactBlockSpec(
  { type: 'whiteboardEmbed', propSchema: { whiteboardId: { default: '' } }, content: 'none' },
  {
    meta: { selectable: false },
    render: (props) => (
      <DemoWhiteboardEmbedView
        whiteboardId={props.block.props.whiteboardId}
        onPick={(id) => props.editor.updateBlock(props.block, { props: { whiteboardId: id } })}
      />
    ),
  },
)

export const DemoPageMention = createReactInlineContentSpec(
  {
    type: 'mention',
    content: 'none',
    propSchema: { pageId: { default: '' }, title: { default: '' }, projectId: { default: '' } },
  },
  {
    render: (props) => {
      const { pageId, title, projectId } = props.inlineContent.props
      return <DemoMentionChip pageId={pageId} title={title} projectId={projectId} />
    },
  },
)

// Drop BlockNote's built-in `table` block (same rationale as the real schema).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { table: _table, ...baseBlockSpecs } = defaultBlockSpecs

export const demoDocSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...baseBlockSpecs,
    callout: DemoCallout(),
    databaseEmbed: DemoDatabaseEmbed(),
    whiteboardEmbed: DemoWhiteboardEmbed(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: DemoPageMention },
})
