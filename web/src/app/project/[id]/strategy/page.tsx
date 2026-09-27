import type { Metadata } from 'next'
import StrategyWorkspace from '@/components/strategy/strategy-workspace'

export const metadata: Metadata = { title: 'Strategy · BRANDOS' }

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StrategyWorkspace id={id} />
}
