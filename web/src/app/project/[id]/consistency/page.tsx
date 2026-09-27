import type { Metadata } from 'next'
import ConsistencyWorkspace from '@/components/consistency/consistency-workspace'
import { requirePageAuth } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Consistency · BRANDOS' }

export default async function ConsistencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePageAuth(`/project/${id}/consistency`)
  return <ConsistencyWorkspace id={id} />
}
