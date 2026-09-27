import type { Metadata } from 'next'
import StressWorkspace from '@/components/stress-test/stress-workspace'
import { requirePageAuth } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Stress Test · BRANDOS' }

export default async function StressTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePageAuth(`/project/${id}/stress-test`)
  return <StressWorkspace id={id} />
}
