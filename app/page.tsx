import Link from 'next/link'
const cards=[
  {title:'Find Providers',body:'Search by city and service. Compare options side-by-side.',href:'/find-providers',cta:'Start searching'},
  {title:'Understand Services',body:'Plain-English guides to home care, assisted living, memory care, and more.',href:'/services',cta:'Read guides'},
  {title:'Get Help',body:'Tell us what you need. We’ll match you to local providers.',href:'/contact',cta:'Request help'},
]
export default function Home(){return (<div>
  <section className="relative overflow-hidden">
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_50%_0%,#e8f0ff,transparent_70%)]" />
    <div className="container py-14">
      <span className="chip">Care made simpler</span>
      <h1 className="mt-3 text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">Find trusted care — fast.</h1>
      <p className="text-slate-700 mt-4 max-w-2xl">Search providers, compare services, and request a call. We do the legwork so you don’t have to.</p>
      <div className="mt-6 flex gap-3 flex-wrap">
        <Link href="/find-providers" className="btn btn-primary">Find Providers</Link>
        <Link href="/services" className="btn">Understand Services</Link>
      </div>
    </div>
  </section>
  <section className="container py-10">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map(c=>(<article key={c.title} className="card">
        <h2 className="text-xl font-bold">{c.title}</h2>
        <p className="text-slate-700 mt-2">{c.body}</p>
        <div className="mt-3"><Link href={c.href} className="btn">{c.cta}</Link></div>
      </article>))}
    </div>
  </section>
  <section className="container pb-14">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-2xl font-bold">Popular cities</h2>
      <Link href="/locations" className="btn">Browse all</Link>
    </div>
    <div className="flex flex-wrap gap-2">
      {[
        {slug:'albany-ny',name:'Albany, NY'},{slug:'buffalo-ny',name:'Buffalo, NY'},
        {slug:'rochester-ny',name:'Rochester, NY'},{slug:'syracuse-ny',name:'Syracuse, NY'},
        {slug:'yonkers-ny',name:'Yonkers, NY'},{slug:'austin-tx',name:'Austin, TX'},
        {slug:'seattle-wa',name:'Seattle, WA'},
      ].map(c=><Link key={c.slug} href={`/locations/${c.slug}`} className="chip">{c.name}</Link>)}
    </div>
  </section>
  <section className="bg-blue-50">
    <div className="container py-12">
      <div className="card flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h3 className="text-xl font-bold">Need a short list fast?</h3>
          <p className="text-slate-700">Tell us your city and needs—we’ll send 3–5 options.</p>
        </div>
        <Link href="/contact" className="btn btn-primary">Request help</Link>
      </div>
    </div>
  </section>
</div>)}