import type { Metadata } from 'next'
import { Archivo_Black, Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BRANDOS',
  description: 'AI brand decision engine. Build it. Challenge it. Launch it.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${archivoBlack.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
