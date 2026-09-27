import type { Metadata } from 'next'
import { PosterRoom } from '@/components/landing/poster-section'
import { Wordmark } from '@/components/project/workflow-nav'
import NewProjectForm from '@/components/project/new-project-form'

export const metadata: Metadata = { title: 'New project · BRANDOS' }

export default function NewProjectPage() {
  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-poster-paper text-poster-ink antialiased">
      <PosterRoom />
      <div className="relative z-10 flex min-h-[100svh] flex-col p-6 md:p-10">
        <Wordmark />
        <div className="flex flex-1 items-center justify-center py-12">
          <NewProjectForm />
        </div>
      </div>
    </main>
  )
}
