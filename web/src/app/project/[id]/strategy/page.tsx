import type { Metadata } from 'next'
import StrategyWorkspace from '@/components/strategy/strategy-workspace'
import { requirePageAuth } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Strategy · BRANDOS' }

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePageAuth(`/project/${id}/strategy`)
  return <StrategyWorkspace id={id} />
}
