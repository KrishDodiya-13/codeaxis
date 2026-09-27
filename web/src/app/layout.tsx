import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BRANDOS',
  description: 'AI brand decision engine. Build it. Challenge it. Launch it.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
