'use client'

import { useEffect, useRef, useState } from 'react'
import TechText from '@/components/TechText'
import { cn } from '@/lib/utils'

export interface TechHeadingLine {
  text: string
  color?: string
  /** Let this line's cursor sweep on its own when nobody is hovering, as a hint. */
  sweep?: boolean
}

// Archivo Black caps average about this many ems per character at our letter spacing.
const EM_PER_CHAR = 0.74
// A canvas row needs this much height per em of font size, or TechText shrinks the line.
const ROW_PER_EM = 1.12

/**
 * A multi-line poster headline where every line is a TechText canvas.
 * All lines share one font size, so short lines are not blown up bigger than long ones.
 */
export default function TechHeading({
  label,
  lines,
  maxFontSize = 104,
  className,
}: {
  /** The heading as readable text, for screen readers and search. */
  label: string
  lines: TechHeadingLine[]
  maxFontSize?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState(maxFontSize)
  const longest = Math.max(...lines.map((l) => l.text.length))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFontSize(Math.min(maxFontSize, el.clientWidth / (longest * EM_PER_CHAR)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [longest, maxFontSize])

  return (
    <h2 className={cn('w-full font-display', className)}>
      <span className="sr-only">{label}</span>
      {/* Canvases are not readable text, so they are hidden from assistive tech. */}
      <div ref={ref} aria-hidden="true">
      {lines.map((line) => (
        <div key={line.text} style={{ height: fontSize * ROW_PER_EM }}>
          <TechText
            text={line.text}
            align="left"
            fontWeight={400}
            fontSize={fontSize}
            letterSpacing={-0.045}
            color={line.color ?? '#111111'}
            accentColor="#5eb57a"
            reveal="letter"
            dashLength={4}
            dashGap={2}
            specks={15}
            reach={200}
            sweep={line.sweep ?? false}
          />
        </div>
      ))}
      </div>
    </h2>
  )
}
