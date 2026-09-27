import type { Metadata } from 'next'
import DiscoveryWorkspace from '@/components/discovery/discovery-workspace'
import { requirePageAuth } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Discover · BRANDOS' }

export default async function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Checked before the workspace renders, so a logged-out visitor lands on the login page
  // rather than on a page whose first request would come back 401.
  await requirePageAuth(`/project/${id}/discover`)
  return <DiscoveryWorkspace id={id} />
}
