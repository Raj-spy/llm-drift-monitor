'use client'

export const dynamic = 'force-dynamic'
import dynamic from 'next/dynamic'

const App = dynamic(() => import('./app'), { ssr: false })

export default function DashboardPage() {
  return <App />
}

