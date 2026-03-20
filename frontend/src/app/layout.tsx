import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'LLM Drift Monitor — Cost, Latency & Quality Observability',
  description: 'Monitor your LLM API usage in production. Track cost spikes, latency increases, and output quality drift in real time.',
  verification: {
    google: 'SB3QZkygVu9_u4JUPhbxwjqpcNwo782_e4RFGfgoA8A',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}