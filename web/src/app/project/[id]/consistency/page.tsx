import type { Metadata } from 'next'
import ConsistencyWorkspace from '@/components/consistency/consistency-workspace'

export const metadata: Metadata = { title: 'Consistency · BRANDOS' }

export default async function ConsistencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ConsistencyWorkspace id={id} />
}
