import Link from 'next/link'
export default function NotFound(){
  return (<div className="container py-16 text-center">
    <h1 className="text-4xl font-extrabold">Page not found</h1>
    <p className="text-slate-600 mt-2">The page you’re looking for doesn’t exist.</p>
    <div className="mt-6 flex gap-3 justify-center">
      <Link className="btn btn-primary" href="/">Go home</Link>
      <Link className="btn" href="/find-providers">Find Providers</Link>
    </div>
  </div>)
}
