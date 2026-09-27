const STAGES = [
  { name: 'Discover', summary: 'An adaptive interview turns a rough idea into structured facts.' },
  { name: 'Position', summary: 'Category, audience, value and differentiator, each with a reason.' },
  { name: 'Shape', summary: 'Personality, naming territories, taglines and message hierarchy.' },
  { name: 'Visualize', summary: 'A visual brief tied back to audience and positioning.' },
  { name: 'Brand Battle', summary: 'Competing directions with trade-offs. You choose.' },
  { name: 'Stress Test', summary: 'We try to break the brand, then help you fix it.' },
  { name: 'Consistency', summary: 'Check real content against the approved Brand DNA.' },
  { name: 'Brand OS', summary: 'A launch-ready brand system, not a chat transcript.' },
] as const

export default function WorkflowStages() {
  return (
    <section className="container py-24">
      <h2 className="mb-12 text-3xl font-semibold tracking-tight">How BRANDOS works</h2>
      <ol className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, i) => (
          <li key={stage.name} className="space-y-2 bg-background p-6">
            <span className="font-mono text-xs text-muted-foreground">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="font-medium">{stage.name}</h3>
            <p className="text-sm text-muted-foreground">{stage.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
