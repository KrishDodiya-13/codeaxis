'use client'

import Lanyard from '@/components/ui/lanyard'

// Thin wrapper around the 3D lanyard. Loaded client-only from hero-section.
export default function BrandosLanyardControls() {
  return (
    <Lanyard
      position={[0, 0, 20]}
      gravity={[0, -40, 0]}
      containerClassName="relative h-[480px] w-full md:h-[640px]"
    />
  )
}
