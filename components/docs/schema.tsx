'use client'

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'
import { MentionChip } from './mention-chip'

/**
 * The Docs editor schema = BlockNote defaults + two additions:
 *
 *  - `callout`: the ONE block from the Phase-3 spec that BlockNote doesn't ship
 *    by default (text / headings / lists / toggle / quote / code / divider are
 *    all built in). createReactBlockSpec returns a factory in 0.51.x, so it's
 *    registered as `callout: Callout()`.
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

export const docSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: Callout() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: PageMention },
})
