import { DemoDatabaseView } from '@/components/demo/databases/demo-database-view'

export default async function DemoDatabasePage({
  params,
}: {
  params: Promise<{ projectId: string; databaseId: string }>
}) {
  const { databaseId } = await params
  return <DemoDatabaseView databaseId={databaseId} />
}
