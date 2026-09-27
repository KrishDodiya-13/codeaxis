import type { Metadata } from 'next'
import DiscoveryWorkspace from '@/components/discovery/discovery-workspace'

export const metadata: Metadata = { title: 'Discover · BRANDOS' }

export default async function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DiscoveryWorkspace id={id} />
}
