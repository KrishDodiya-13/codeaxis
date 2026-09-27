import type { Metadata } from 'next'
import StressWorkspace from '@/components/stress-test/stress-workspace'

export const metadata: Metadata = { title: 'Stress Test · BRANDOS' }

export default async function StressTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StressWorkspace id={id} />
}
