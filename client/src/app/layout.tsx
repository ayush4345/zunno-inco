import './globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './provider'
import { Analytics } from "@vercel/analytics/react"
import type React from "react"

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title:  'Zunno',
  description: 'A decentralized UNO game built on chain',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`bg-cover bg-black ${inter.className}`}>
        <Analytics />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
