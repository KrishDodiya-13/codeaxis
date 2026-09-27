import { cn } from '@/lib/utils'

/**
 * Splits text into letters that lift and turn poster-green on hover,
 * the same micro-interaction as the hero headline's letters.
 */
export default function HoverLetters({ text, className }: { text: string; className?: string }) {
  const words = text.split(' ')
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <span key={w}>
            <span className="inline-block whitespace-nowrap">
              {Array.from(word).map((ch, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-block transition-[transform,color] duration-300 ease-[cubic-bezier(.3,1.6,.5,1)]',
                    'hover:-translate-y-[0.08em] hover:-rotate-[4deg] hover:text-poster-green',
                    'motion-reduce:transition-none motion-reduce:hover:transform-none'
                  )}
                >
                  {ch}
                </span>
              ))}
            </span>
            {w < words.length - 1 && ' '}
          </span>
        ))}
      </span>
    </span>
  )
}
