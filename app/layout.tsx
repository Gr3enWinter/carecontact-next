import '@/styles/globals.css'
import Link from 'next/link'

export const metadata = { title: 'Care Contact Directory', description: 'Find trusted care—fast.' }

export default function RootLayout({ children }: { children: React.ReactNode }){
  return (<html lang="en"><body>
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b">
      <div className="container flex items-center gap-4 py-3">
        <Link href="/" className="font-extrabold text-lg">Care Contact Directory</Link>
        <nav className="ml-auto hidden md:flex gap-2">
          <Link href="/find-providers" className="btn btn-ghost">Find Providers</Link>
          <Link href="/services" className="btn btn-ghost">Services</Link>
          <Link href="/locations" className="btn btn-ghost">Locations</Link>
          <Link href="/about" className="btn btn-ghost">About</Link>
          <Link href="/blog" className="btn btn-ghost">Blog</Link>
        </nav>
        <Link href="/contact" className="btn btn-primary">Get Help</Link>
      </div>
    </header>
    <main>{children}</main>
    <footer className="mt-16 border-t">
      <div className="container py-8 text-sm text-slate-600 flex items-center justify-between flex-wrap gap-3">
        <div>© {new Date().getFullYear()} CareContactDirectory.com · Information only, not medical advice.</div>
        <nav className="flex gap-4">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/disclaimer">Disclaimer</Link>
          <Link href="/accessibility">Accessibility</Link>
        </nav>
      </div>
    </footer>
  </body></html>)
}
