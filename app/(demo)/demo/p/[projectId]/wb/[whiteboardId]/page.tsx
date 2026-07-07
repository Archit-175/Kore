import { DemoWhiteboardView } from '@/components/demo/whiteboards/demo-whiteboard-view'

export default async function DemoWhiteboardPage({
  params,
}: {
  params: Promise<{ projectId: string; whiteboardId: string }>
}) {
  const { projectId, whiteboardId } = await params
  return <DemoWhiteboardView whiteboardId={whiteboardId} projectId={projectId} />
}
