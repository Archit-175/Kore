import { DemoPageDocView } from '@/components/demo/docs/demo-page-doc-view'

export default async function DemoPagePage({
  params,
}: {
  params: Promise<{ projectId: string; pageId: string }>
}) {
  const { pageId } = await params
  return <DemoPageDocView pageId={pageId} />
}
