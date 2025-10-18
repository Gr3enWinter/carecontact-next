'use client'
import Link from 'next/link'
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }){
  return (<html><body>
    <div className="container py-16 text-center">
      <h1 className="text-4xl font-extrabold">Something went wrong</h1>
      <p className="text-slate-600 mt-2">Please try again.</p>
      <div className="mt-6 flex gap-3 justify-center">
        <button className="btn btn-primary" onClick={() => reset()}>Retry</button>
        <Link className="btn" href="/">Go home</Link>
      </div>
    </div>
  </body></html>)
}
