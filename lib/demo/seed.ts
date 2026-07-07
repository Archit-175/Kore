// The demo seed dataset. One pure function builds a realistic snapshot mirroring
// the real aggregate types so /demo feels alive on first load. Timestamps are
// FIXED constants (anchored to DEMO_BASE) so the value is identical on the SSR
// pass and the client hydrate — any locale/relative-time rendering in the demo
// forks is additionally mount-gated (see components/demo/demo-time.tsx).
//
// Entity ids are stable, readable strings ('proj-web', 'db-tasks', …) so the demo
// routes resolve and cross-links are easy; entities CREATED at runtime use
// crypto.randomUUID(). Imports are types-only + pure helpers — no Supabase.

import { userColor } from '@/lib/yjs/awareness'
import type { PresenceUser } from '@/lib/presence'
import type { DbMember } from '@/lib/databases/types'
import type { DemoSeed } from './store'

// --- fixed time base (deterministic) -----------------------------------------
const DEMO_BASE = Date.parse('2026-07-08T15:00:00.000Z')
/** ISO string for `mins` minutes before the fixed demo base. */
const ago = (mins: number): string => new Date(DEMO_BASE - mins * 60_000).toISOString()

// --- ids ---------------------------------------------------------------------
export const DEMO = {
  workspaceId: 'demo-ws',
  teamId: 'team-eng',
  projWeb: 'proj-web',
  projMobile: 'proj-mobile',
  you: 'demo-you',
  ada: 'demo-ada',
  ben: 'demo-ben',
  mira: 'demo-mira',
  pageGettingStarted: 'page-getting-started',
  pageRoadmap: 'page-roadmap',
  dbTasks: 'db-tasks',
  wbSprint: 'wb-sprint',
} as const

// --- tiny inline SVG avatars (data URIs → <img src> works, no network) --------
function avatarUri(initials: string, bg: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>` +
    `<rect width='64' height='64' rx='32' fill='${bg}'/>` +
    `<text x='50%' y='50%' dy='.35em' text-anchor='middle' ` +
    `font-family='system-ui,sans-serif' font-size='26' fill='white'>${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// A tiny decorative image used as a note attachment (a soft gradient card).
const NOTE_IMAGE_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='220'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='#6366f1'/><stop offset='1' stop-color='#ec4899'/>` +
    `</linearGradient></defs><rect width='400' height='220' fill='url(#g)'/>` +
    `<text x='24' y='120' font-family='system-ui,sans-serif' font-size='28' ` +
    `fill='white' font-weight='700'>Launch moodboard ✨</text></svg>`,
)}`

export function buildSeed(): DemoSeed {
  // --- members (DbMember: id/name/handle/avatarUrl) --------------------------
  const members: DbMember[] = [
    { id: DEMO.you, name: 'You', handle: 'you', avatarUrl: null },
    { id: DEMO.ada, name: 'Ada Lovelace', handle: 'ada', avatarUrl: avatarUri('AL', '#8b5cf6') },
    { id: DEMO.ben, name: 'Ben Carter', handle: 'ben', avatarUrl: avatarUri('BC', '#14b8a6') },
    { id: DEMO.mira, name: 'Mira Shah', handle: 'mira', avatarUrl: null },
  ]
  const asPresence = (m: DbMember): PresenceUser => ({
    id: m.id,
    name: m.name,
    color: userColor(m.id),
    avatarUrl: m.avatarUrl,
  })
  const presenceUser = asPresence(members[0])
  // 2 static "online" peers to hint at the real-time nature (no networking).
  const onlinePeers = [asPresence(members[1]), asPresence(members[2])]

  // --- shell -----------------------------------------------------------------
  const teams = [{ id: DEMO.teamId, name: 'Engineering', icon: '🛠️' }]
  const projects = [
    { id: DEMO.projWeb, name: 'Website', icon: '🌐', teamId: DEMO.teamId },
    { id: DEMO.projMobile, name: 'Mobile App', icon: '📱', teamId: DEMO.teamId },
  ]

  // --- notes -----------------------------------------------------------------
  const labels = [
    { id: 'label-work', name: 'Work', color: 'blue' as const },
    { id: 'label-idea', name: 'Idea', color: 'purple' as const },
  ]
  const noteBase = {
    projectId: null as string | null,
    archivedAt: null as string | null,
    trashedAt: null as string | null,
    createdBy: DEMO.you,
    labelIds: [] as string[],
    attachments: [] as { id: string; path: string; signedUrl: string | null; mimeType: string | null }[],
    checklist: [] as { id: string; text: string; checked: boolean; position: number }[],
  }
  const notes = [
    {
      ...noteBase,
      id: 'note-launch',
      title: 'Launch week checklist',
      content: 'Everything we need before Friday.',
      color: 'yellow' as const,
      pinned: true,
      createdAt: ago(300),
      updatedAt: ago(30),
      checklist: [
        { id: 'chk-1', text: 'Finalize pricing page', checked: true, position: 0 },
        { id: 'chk-2', text: 'QA the signup flow', checked: false, position: 1 },
        { id: 'chk-3', text: 'Schedule announcement tweet', checked: false, position: 2 },
      ],
    },
    {
      ...noteBase,
      id: 'note-standup',
      title: 'Standup notes',
      content: 'Ada: shipping the new nav. Ben: CI is green. Mira: docs draft ready for review.',
      color: 'blue' as const,
      pinned: false,
      labelIds: ['label-work'],
      createdAt: ago(600),
      updatedAt: ago(120),
    },
    {
      ...noteBase,
      id: 'note-idea',
      title: 'Idea: keyboard-first mode',
      content: 'A ⌘K command for everything. Power users would love it.',
      color: 'green' as const,
      pinned: false,
      labelIds: ['label-idea'],
      createdAt: ago(1500),
      updatedAt: ago(1500),
    },
    {
      ...noteBase,
      id: 'note-moodboard',
      title: 'Brand moodboard',
      content: 'Warm gradients, rounded corners, lots of whitespace.',
      color: 'pink' as const,
      pinned: false,
      createdAt: ago(2000),
      updatedAt: ago(800),
      attachments: [
        { id: 'att-1', path: 'demo/moodboard.svg', signedUrl: NOTE_IMAGE_URI, mimeType: 'image/svg+xml' },
      ],
    },
    {
      ...noteBase,
      id: 'note-archived',
      title: 'Old sprint retro',
      content: 'Archived — kept for reference.',
      color: 'default' as const,
      pinned: false,
      archivedAt: ago(4000),
      createdAt: ago(6000),
      updatedAt: ago(4000),
    },
    {
      ...noteBase,
      id: 'note-trashed',
      title: 'Scratch note',
      content: 'Threw this away.',
      color: 'gray' as const,
      pinned: false,
      trashedAt: ago(200),
      createdAt: ago(500),
      updatedAt: ago(200),
    },
  ]

  // --- docs (pages envelope + seeded block bodies + backlinks) ---------------
  const pages = [
    {
      id: DEMO.pageGettingStarted,
      projectId: DEMO.projWeb,
      parentPageId: null,
      title: 'Getting Started',
      icon: '📄',
      sort: 1,
      trashedAt: null,
      createdAt: ago(5000),
      updatedAt: ago(90),
    },
    {
      id: DEMO.pageRoadmap,
      projectId: DEMO.projWeb,
      parentPageId: null,
      title: 'Roadmap',
      icon: '🚀',
      sort: 2,
      trashedAt: null,
      createdAt: ago(4800),
      updatedAt: ago(200),
    },
  ]
  // BlockNote PartialBlock JSON (loose) seeded into each page's Y.Doc on mount.
  const pageSeedBlocks = {
    [DEMO.pageGettingStarted]: [
      { type: 'heading', props: { level: 1 }, content: 'Welcome to Kore 👋' },
      {
        type: 'paragraph',
        content:
          'Kore is your team’s workspace — notes, docs, databases, whiteboards, and chat, all in one place. This whole page is a live editor: click in and start typing.',
      },
      { type: 'heading', props: { level: 2 }, content: 'What you can do' },
      { type: 'bulletListItem', content: 'Write rich docs with slash commands (type /)' },
      { type: 'bulletListItem', content: 'Organize work in databases with table & board views' },
      { type: 'bulletListItem', content: 'Sketch ideas on the whiteboard' },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Next up, check out the ', styles: {} },
          { type: 'mention', props: { pageId: DEMO.pageRoadmap, title: 'Roadmap', projectId: DEMO.projWeb } },
          { type: 'text', text: '.', styles: {} },
        ],
      },
      {
        type: 'callout',
        content: 'Tip: everything here is a demo — your changes reset when you refresh.',
      },
    ],
    [DEMO.pageRoadmap]: [
      { type: 'heading', props: { level: 1 }, content: 'Product Roadmap 🚀' },
      { type: 'paragraph', content: 'Where we’re headed this quarter.' },
      { type: 'heading', props: { level: 2 }, content: 'Now' },
      { type: 'checkListItem', props: { checked: true }, content: 'Ship the new navigation' },
      { type: 'checkListItem', props: { checked: false }, content: 'Launch the pricing page' },
      { type: 'heading', props: { level: 2 }, content: 'Later' },
      { type: 'bulletListItem', content: 'Mobile push notifications' },
      { type: 'bulletListItem', content: 'Offline mode' },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Back to ', styles: {} },
          {
            type: 'mention',
            props: { pageId: DEMO.pageGettingStarted, title: 'Getting Started', projectId: DEMO.projWeb },
          },
          { type: 'text', text: '.', styles: {} },
        ],
      },
    ],
  }
  const backlinks = {
    // Roadmap is linked FROM Getting Started, and vice-versa.
    [DEMO.pageRoadmap]: [
      { sourcePageId: DEMO.pageGettingStarted, projectId: DEMO.projWeb, title: 'Getting Started' },
    ],
    [DEMO.pageGettingStarted]: [
      { sourcePageId: DEMO.pageRoadmap, projectId: DEMO.projWeb, title: 'Roadmap' },
    ],
  }

  // --- database (Tasks: Table + Board) ---------------------------------------
  const databases = [
    {
      database: { id: DEMO.dbTasks, projectId: DEMO.projWeb, name: 'Tasks', icon: '✅' },
      properties: [
        { id: 'p-name', name: 'Name', type: 'title' as const, options: [], sort: 0 },
        {
          id: 'p-status',
          name: 'Status',
          type: 'status' as const,
          sort: 1,
          options: [
            { id: 'o-todo', name: 'To do', color: 'gray' as const },
            { id: 'o-doing', name: 'In progress', color: 'blue' as const },
            { id: 'o-done', name: 'Done', color: 'green' as const },
          ],
        },
        { id: 'p-assignee', name: 'Assignee', type: 'person' as const, options: [], sort: 2 },
        { id: 'p-due', name: 'Due', type: 'date' as const, options: [], sort: 3 },
      ],
      views: [
        { id: 'v-table', name: 'Table', type: 'table' as const, groupPropertyId: null, sort: 0, config: {} },
        { id: 'v-board', name: 'Board', type: 'board' as const, groupPropertyId: 'p-status', sort: 1, config: {} },
      ],
      rows: [
        row('r1', { 'p-name': 'Design the landing page', 'p-status': 'o-doing', 'p-assignee': [DEMO.ada], 'p-due': '2026-07-10' }, 0),
        row('r2', { 'p-name': 'Set up the CI pipeline', 'p-status': 'o-todo', 'p-assignee': [DEMO.ben] }, 1),
        row('r3', { 'p-name': 'Write the API docs', 'p-status': 'o-done', 'p-assignee': [DEMO.mira] }, 2),
        row('r4', { 'p-name': 'Fix the mobile nav bug', 'p-status': 'o-doing', 'p-assignee': [DEMO.you, DEMO.ben], 'p-due': '2026-07-09' }, 3),
        row('r5', { 'p-name': 'User research interviews', 'p-status': 'o-todo', 'p-assignee': [] }, 4),
        row('r6', { 'p-name': 'Prep the launch checklist', 'p-status': 'o-done', 'p-assignee': [DEMO.ada], 'p-due': '2026-07-05' }, 5),
      ],
    },
  ]
  const dbExtra = { [DEMO.dbTasks]: { sort: 0, trashedAt: null } }

  // --- whiteboard (Excalidraw element skeletons — converted on the client) ---
  const whiteboards = [
    { id: DEMO.wbSprint, projectId: DEMO.projWeb, title: 'Sprint Planning', icon: '🎨', sort: 0, trashedAt: null },
  ]
  const whiteboardSeed = {
    [DEMO.wbSprint]: [
      { type: 'text', x: 220, y: 60, text: 'Sprint 12 — Planning', fontSize: 28 },
      {
        type: 'rectangle', x: 120, y: 160, width: 200, height: 110,
        backgroundColor: '#fef3c7', strokeColor: '#f59e0b', label: { text: 'To do' },
      },
      {
        type: 'rectangle', x: 460, y: 160, width: 200, height: 110,
        backgroundColor: '#dbeafe', strokeColor: '#3b82f6', label: { text: 'In progress' },
      },
      {
        type: 'arrow', x: 330, y: 215, width: 120, height: 0,
        start: { type: 'rectangle' }, end: { type: 'rectangle' },
      },
      {
        type: 'ellipse', x: 300, y: 340, width: 220, height: 90,
        backgroundColor: '#dcfce7', strokeColor: '#22c55e', label: { text: 'Ship it! 🚀' },
      },
    ],
  }

  // --- chat (~8 messages, ascending; reactions, a quote-reply, mentions) -----
  const chat = [
    msg('m1', DEMO.ada, members, 'Morning team! Kicking off sprint 12 today 🎉', ago(240)),
    msg('m2', DEMO.ben, members, 'CI is finally green across the board ✅', ago(232), {
      reactions: [{ emoji: '🎉', count: 2, mine: false }, { emoji: '🔥', count: 1, mine: true }],
    }),
    msg('m3', DEMO.mira, members, 'Nice! I pushed the first draft of the API docs.', ago(220)),
    msg('m4', DEMO.you, members, 'Awesome work both of you 🙌', ago(210)),
    msg('m5', DEMO.ada, members, 'Quick q: are we still launching the pricing page Friday?', ago(120)),
    msg('m6', DEMO.you, members, 'Yep — it’s on the Roadmap. Just needs final copy.', ago(110), {
      parentMessageId: 'm5',
      quoted: { id: 'm5', authorName: 'Ada Lovelace', body: 'Quick q: are we still launching the pricing page Friday?' },
    }),
    msg('m7', DEMO.ben, members, 'Hey @mira can you review the docs before then?', ago(60), {
      mentions: [DEMO.mira],
    }),
    msg('m8', DEMO.mira, members, 'On it! 👀', ago(50), {
      reactions: [{ emoji: '👍', count: 2, mine: true }],
    }),
  ]

  // --- comments (polymorphic key `${type}:${id}`) ----------------------------
  const comments = {
    [`page:${DEMO.pageGettingStarted}`]: [
      comment('c1', DEMO.ada, members, 'Love this intro — super clear!', ago(80)),
      comment('c2', DEMO.you, members, 'Thanks! Added a link to the roadmap.', ago(70)),
    ],
    [`note:note-launch`]: [comment('c3', DEMO.ben, members, 'I’ll take the QA item.', ago(25))],
  }

  // --- activity (per project) ------------------------------------------------
  const activity = {
    [DEMO.projWeb]: [
      act('a1', 'Ada Lovelace', 'created', 'page', 'Getting Started', ago(120)),
      act('a2', 'Ben Carter', 'created', 'database', 'Tasks', ago(100)),
      act('a3', 'Mira Shah', 'created', 'whiteboard', 'Sprint Planning', ago(80)),
      act('a4', 'You', 'renamed', 'page', 'Roadmap', ago(40)),
    ],
    [DEMO.projMobile]: [],
  }

  return {
    workspace: { id: DEMO.workspaceId, name: 'Kore Demo' },
    members,
    presenceUser,
    onlinePeers,
    teams,
    projects,
    notes,
    labels,
    pages,
    pageSeedBlocks,
    backlinks,
    databases,
    dbExtra,
    whiteboards,
    whiteboardSeed,
    chat,
    comments,
    activity,
  }
}

// --- small record builders ---------------------------------------------------
function row(
  id: string,
  data: Record<string, string | string[]>,
  sort: number,
): { id: string; data: Record<string, string | string[]>; sort: number; viewOrder: Record<string, number>; createdAt: string; updatedAt: string } {
  return { id, data, sort, viewOrder: {}, createdAt: ago(300 - sort), updatedAt: ago(60 - sort) }
}

function msg(
  id: string,
  authorId: string,
  members: DbMember[],
  body: string,
  createdAt: string,
  extra?: Partial<{
    parentMessageId: string
    quoted: { id: string; authorName: string; body: string }
    mentions: string[]
    reactions: { emoji: string; count: number; mine: boolean }[]
  }>,
) {
  const author = members.find((m) => m.id === authorId)!
  return {
    id,
    authorId,
    authorName: author.name,
    authorAvatarUrl: author.avatarUrl,
    body,
    parentMessageId: extra?.parentMessageId ?? null,
    quoted: extra?.quoted ?? null,
    mentions: extra?.mentions ?? [],
    attachments: [],
    reactions: extra?.reactions ?? [],
    editedAt: null,
    createdAt,
  }
}

function comment(id: string, authorId: string, members: DbMember[], body: string, createdAt: string) {
  const author = members.find((m) => m.id === authorId)!
  return {
    id,
    authorId,
    authorName: author.name,
    authorAvatarUrl: author.avatarUrl,
    body,
    mentions: [],
    createdAt,
    edited: false,
  }
}

function act(
  id: string,
  actorName: string,
  action: string,
  targetType: string,
  targetTitle: string,
  createdAt: string,
) {
  return { id, actorName, action, targetType, targetTitle, createdAt }
}
