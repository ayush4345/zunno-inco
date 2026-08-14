'use client';

import Hero from "@/components/homepage/Hero"
import Navbar from "@/components/homepage/Navbar"
import Footer from "@/components/homepage/Footer"

export default function Home() {
  return (
    <main className="bg-black overflow-hidden">
      <div className="">
        <Navbar />
        <Hero />
        <div className="relative">
          <Footer />
        </div>
      </div>
    </main>
  )
}
