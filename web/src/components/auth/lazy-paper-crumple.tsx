'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { PaperCrumpleProps } from '@/components/PaperCrumple'

/*
 * The crumplable print, loaded only when it will actually be seen.
 *
 * PaperCrumple pulls in three.js (~125 kB compressed) and spends about a second of main
 * thread building its geometry. It is decoration, and it only shows at xl widths — so:
 *
 *   - the import is dynamic, so three.js is a separate chunk that no page (and no link
 *     prefetch from the landing page) downloads up front
 *   - it mounts only on screens ≥ 1280px, where it is visible
 *   - it waits for the browser to go idle, so the form is interactive first
 */
const PaperCrumple = dynamic(() => import('@/components/PaperCrumple'), { ssr: false })

const XL = '(min-width: 1280px)'

export default function LazyPaperCrumple(props: PaperCrumpleProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(XL)
    let idle = 0
    let timer = 0

    const schedule = () => {
      if (!media.matches) return
      // requestIdleCallback isn't in every browser; a short timeout is a fine stand-in.
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => setShow(true), { timeout: 2000 })
      else timer = globalThis.setTimeout(() => setShow(true), 600) as unknown as number
    }

    schedule()
    // Resized up to xl later: load it then, not before.
    const onChange = () => schedule()
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
      if (idle) window.cancelIdleCallback(idle)
      window.clearTimeout(timer)
    }
  }, [])

  return show ? <PaperCrumple {...props} /> : null
}
