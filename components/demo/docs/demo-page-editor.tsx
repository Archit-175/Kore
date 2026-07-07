'use client'

import { useEffect, useMemo } from 'react'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import '../../docs/blocknote-theme.css'
import { pageDisplayTitle } from '@/lib/docs/types'
import type { PresenceUser } from '@/lib/presence'
import { useTheme } from '@/components/theme-provider'
import { useDemoStore } from '@/lib/demo/context'
import { DatabaseEmbedContext } from '@/components/docs/database-embed-context'
import { WhiteboardEmbedContext } from '@/components/docs/whiteboard-embed-context'
import { demoDocSchema } from './demo-schema'

/**
 * Demo fork of PageEditor: the SAME collaboration binding + slash menu, bound to
 * an offline Y.Doc from the DemoStore. Only the 4 data-touching callbacks change:
 *  - uploadFile → in-memory object URL (no Storage),
 *  - resolveFileUrl → passthrough (urls are already blob/data/http),
 *  - getMentionItems → filter the in-memory page list,
 *  - link/search sync → dropped.
 * The body is seeded ONCE per page (guarded in the store) via replaceBlocks.
 */
export function DemoPageEditor({
  ydoc,
  awareness,
  pageId,
  projectId,
  user,
}: {
  ydoc: Y.Doc
  awareness: Awareness
  pageId: string
  projectId: string
  workspaceId?: string
  user: PresenceUser
}) {
  const { theme } = useTheme()
  const store = useDemoStore()
  const embedCtx = useMemo(() => ({ workspaceId: store.workspace.id, projectId }), [store, projectId])
  const wbEmbedCtx = useMemo(
    () => ({ workspaceId: store.workspace.id, projectId, user }),
    [store, projectId, user],
  )

  const editor = useCreateBlockNote(
    {
      schema: demoDocSchema,
      collaboration: {
        provider: { awareness },
        fragment: ydoc.getXmlFragment('document-store'),
        user: { name: user.name, color: user.color },
        showCursorLabels: 'activity',
      },
      uploadFile: async (file: File) => URL.createObjectURL(file),
      resolveFileUrl: async (url: string) => url,
    },
    [ydoc, awareness],
  )

  // Seed the body once (the ydoc fragment persists across remounts, so guard it).
  useEffect(() => {
    if (store.isPageSeeded(pageId)) return
    const blocks = store.pageSeedFor(pageId)
    store.markPageSeeded(pageId)
    if (!blocks || blocks.length === 0) return
    // Defer a tick so the collaboration binding has attached to the fragment.
    const t = setTimeout(() => {
      try {
        editor.replaceBlocks(
          editor.document,
          blocks as unknown as Parameters<typeof editor.replaceBlocks>[1],
        )
      } catch {
        // ignore — seeding is best-effort
      }
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getSlashItems = async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    const defaults = getDefaultReactSlashMenuItems(editor)
    const basicGroup = editor.dictionary.slash_menu.paragraph.group
    const callout: DefaultReactSuggestionItem = {
      title: 'Callout',
      subtext: 'Highlighted info box',
      aliases: ['callout', 'note', 'info', 'tip'],
      group: basicGroup,
      icon: <span>💡</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' }),
    }
    const database: DefaultReactSuggestionItem = {
      title: 'Database',
      subtext: 'Embed a table / board',
      aliases: ['database', 'table', 'board', 'kanban', 'grid'],
      group: basicGroup,
      icon: <span>🗄</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'databaseEmbed' }),
    }
    const whiteboard: DefaultReactSuggestionItem = {
      title: 'Whiteboard',
      subtext: 'Embed an Excalidraw canvas',
      aliases: ['whiteboard', 'canvas', 'draw', 'excalidraw', 'diagram', 'sketch'],
      group: basicGroup,
      icon: <span>🎨</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'whiteboardEmbed' }),
    }
    const extras = [callout, database, whiteboard]
    const lastBasic = defaults.map((i) => i.group).lastIndexOf(basicGroup)
    const items =
      lastBasic >= 0
        ? [...defaults.slice(0, lastBasic + 1), ...extras, ...defaults.slice(lastBasic + 1)]
        : [...defaults, ...extras]
    return filterSuggestionItems(items, query)
  }

  const getMentionItems = async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    const q = query.trim().toLowerCase()
    return store.pages
      .filter((p) => !p.trashedAt && (!q || p.title.toLowerCase().includes(q)))
      .slice(0, 8)
      .map((p) => ({
        title: pageDisplayTitle(p.title),
        onItemClick: () => {
          editor.insertInlineContent([
            { type: 'mention', props: { pageId: p.id, title: p.title, projectId: p.projectId } },
            ' ',
          ])
        },
      }))
  }

  return (
    <DatabaseEmbedContext.Provider value={embedCtx}>
      <WhiteboardEmbedContext.Provider value={wbEmbedCtx}>
        <div className="kore-doc-editor">
          <BlockNoteView editor={editor} theme={theme} slashMenu={false}>
            <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
            <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
          </BlockNoteView>
        </div>
      </WhiteboardEmbedContext.Provider>
    </DatabaseEmbedContext.Provider>
  )
}
