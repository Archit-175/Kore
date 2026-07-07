import { DemoProjectDocsHome } from '@/components/demo/docs/demo-project-docs-home'

export default async function DemoProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <DemoProjectDocsHome projectId={projectId} />
}
