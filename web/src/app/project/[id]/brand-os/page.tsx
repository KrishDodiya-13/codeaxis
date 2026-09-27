import type { Metadata } from 'next'
import BrandOsWorkspace from '@/components/brand-os/brand-os-workspace'
import { requirePageAuth } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Brand OS · BRANDOS' }

export default async function BrandOsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePageAuth(`/project/${id}/brand-os`)
  return <BrandOsWorkspace id={id} />
}
