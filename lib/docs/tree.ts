// Pure tree helpers — no React, no Supabase. Shared by the sidebar tree and the
// drag-reorder logic; unit-testable in isolation.

import type { PageNode, PageTreeNode } from './types'

const bySortThenCreated = (a: PageNode, b: PageNode) =>
  a.sort - b.sort || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/** Nest a flat page list by `parentPageId`, each level ordered by `sort`. */
export function buildTree(nodes: PageNode[]): PageTreeNode[] {
  const byParent = new Map<string | null, PageNode[]>()
  for (const n of nodes) {
    const arr = byParent.get(n.parentPageId)
    if (arr) arr.push(n)
    else byParent.set(n.parentPageId, [n])
  }
  const build = (parentId: string | null): PageTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort(bySortThenCreated)
      .map((n) => ({ ...n, children: build(n.id) }))
  return build(null)
}

/** Direct children of `parentId` (null = top level), ordered by sort. */
export function siblingsOf(nodes: PageNode[], parentId: string | null): PageNode[] {
  return nodes.filter((n) => n.parentPageId === parentId).sort(bySortThenCreated)
}

/** A fractional rank strictly between two neighbours' sorts (either may be null
 *  at an end). Lets a drag-reorder be a single UPDATE to the midpoint — no bulk
 *  renumber. Precision is ample for an under-10 team's trees. */
export function midpointSort(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0
  if (before === null) return after! - 1
  if (after === null) return before + 1
  return (before + after) / 2
}

/** Next sort value to append a new child after a parent's existing children. */
export function appendSort(nodes: PageNode[], parentId: string | null): number {
  const sibs = siblingsOf(nodes, parentId)
  const last = sibs[sibs.length - 1]
  return last ? last.sort + 1 : 0
}

/** Every id in the subtree rooted at `rootId` (inclusive). Client-side mirror of
 *  the SQL `page_subtree_ids` — blocks a cyclic drop in the UI before the server
 *  re-validates (reparenting a page under its own descendant). */
export function subtreeIds(nodes: PageNode[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentPageId === null) continue
    const arr = childrenOf.get(n.parentPageId)
    if (arr) arr.push(n.id)
    else childrenOf.set(n.parentPageId, [n.id])
  }
  const out = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const c of childrenOf.get(id) ?? []) stack.push(c)
  }
  return out
}
