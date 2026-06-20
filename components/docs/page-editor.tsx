'use client'

import { useMemo, useRef, useEffect } from 'react'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  useEditorChange,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './blocknote-theme.css'
import { createClient } from '@/lib/supabase/client'
import { syncPageLinks } from '@/lib/actions/pages'
import { getSignedUrl, uploadDocFile } from '@/lib/storage'
import { pageDisplayTitle } from '@/lib/docs/types'
import type { PresenceUser } from '@/lib/presence'
import { useTheme } from '@/components/theme-provider'
import { docSchema } from './schema'

const LINK_SYNC_DEBOUNCE = 1500

/**
 * The collaborative BlockNote editor. This is the whole point of Phase 1's Yjs
 * layer: BlockNote binds to the SAME ydoc/awareness the scratchpad used — its
 * YSync extension consumes only `fragment`, its cursor extension only
 * `provider.awareness`. KoreYjsProvider already syncs that ydoc over Supabase
 * broadcast and persists snapshots (doc_type='page'), so there is no new
 * transport here. Mounted with key={pageId} by the parent, so it remounts per
 * page alongside useKoreYDoc's per-doc ydoc.
 *
 * Loaded via next/dynamic({ ssr: false }) — BlockNote is client-only.
 */
export function PageEditor({
  ydoc,
  awareness,
  pageId,
  workspaceId,
  user,
}: {
  ydoc: Y.Doc
  awareness: Awareness
  pageId: string
  workspaceId: string
  user: PresenceUser
}) {
  const { theme } = useTheme()
  const supabase = useMemo(() => createClient(), [])

  const editor = useCreateBlockNote(
    {
      schema: docSchema,
      collaboration: {
        // BlockNote reads only `.awareness` off the provider; the ydoc is synced
        // externally by KoreYjsProvider. The body lives in this XML fragment.
        provider: { awareness },
        fragment: ydoc.getXmlFragment('document-store'),
        user: { name: user.name, color: user.color },
        showCursorLabels: 'activity',
      },
      // Image/file blocks: upload to the shared private bucket and STORE the
      // object path; resolveFileUrl signs it on render (paths survive in the Yjs
      // doc; signed URLs would expire). External URLs pass straight through.
      uploadFile: async (file: File) => {
        const res = await uploadDocFile(supabase, { workspaceId, pageId, file })
        if (res.error || !res.path) throw new Error(res.error ?? 'Upload failed')
        return res.path
      },
      resolveFileUrl: async (url: string) => {
        if (/^(https?:|data:|blob:)/i.test(url)) return url
        return (await getSignedUrl(supabase, url)) ?? url
      },
    },
    [ydoc, awareness],
  )

  // --- backlinks: rewrite this page's outgoing @-mention links on edit --------
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEditorChange(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      const ids = new Set<string>()
      const walk = (blocks: typeof editor.document) => {
        for (const block of blocks) {
          const content = block.content
          if (Array.isArray(content)) {
            for (const ic of content) {
              if (ic.type === 'mention' && ic.props.pageId) ids.add(ic.props.pageId)
            }
          }
          if (block.children.length > 0) walk(block.children)
        }
      }
      walk(editor.document)
      void syncPageLinks(pageId, [...ids])
    }, LINK_SYNC_DEBOUNCE)
  }, editor)
  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    },
    [],
  )

  // --- slash menu: defaults + the custom callout block ------------------------
  const getSlashItems = async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    const defaults = getDefaultReactSlashMenuItems(editor)
    // Reuse the localized "Basic blocks" group label so the callout merges into
    // that group instead of creating a 2nd header (a duplicate React key).
    const basicGroup = editor.dictionary.slash_menu.paragraph.group
    const callout: DefaultReactSuggestionItem = {
      title: 'Callout',
      subtext: 'Highlighted info box',
      aliases: ['callout', 'note', 'info', 'tip'],
      group: basicGroup,
      icon: <span>💡</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' }),
    }
    const lastBasic = defaults.map((i) => i.group).lastIndexOf(basicGroup)
    const items =
      lastBasic >= 0
        ? [...defaults.slice(0, lastBasic + 1), callout, ...defaults.slice(lastBasic + 1)]
        : [...defaults, callout]
    return filterSuggestionItems(items, query)
  }

  // --- @ menu: pick an existing page to mention -------------------------------
  const getMentionItems = async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    let q = supabase
      .from('pages')
      .select('id, title, project_id')
      .eq('workspace_id', workspaceId)
      .is('trashed_at', null)
      .order('updated_at', { ascending: false })
      .limit(8)
    const trimmed = query.trim()
    if (trimmed) q = q.ilike('title', `%${trimmed}%`)
    const { data } = await q
    return (data ?? []).map((p) => ({
      title: pageDisplayTitle(p.title),
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'mention', props: { pageId: p.id, title: p.title, projectId: p.project_id } },
          ' ',
        ])
      },
    }))
  }

  return (
    <div className="kore-doc-editor">
      <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
        <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
      </BlockNoteView>
    </div>
  )
}
