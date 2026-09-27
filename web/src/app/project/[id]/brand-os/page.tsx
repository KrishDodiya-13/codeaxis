import type { Metadata } from 'next'
import BrandOsWorkspace from '@/components/brand-os/brand-os-workspace'

export const metadata: Metadata = { title: 'Brand OS · BRANDOS' }

export default async function BrandOsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BrandOsWorkspace id={id} />
}
