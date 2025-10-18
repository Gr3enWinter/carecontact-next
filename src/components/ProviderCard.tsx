export type Provider = {
  id?: string
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  website?: string | null
  services?: string | null
  featured?: boolean | null
}

function normalizeUrl(u?: string | null){
  if(!u) return null
  if(/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

export default function ProviderCard({ p }: { p: Provider }){
  const services = (p.services || '').split('|').map(s => s.trim()).filter(Boolean)
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{p.name}</h3>
        {p.featured ? <span className="chip">Featured</span> : null}
      </div>
      <div className="text-sm text-ink-700 mt-1">
        {[p.city, p.state, p.zip].filter(Boolean).join(', ')}
      </div>
      {services.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {services.slice(0,6).map(s => <span key={s} className="chip">{s}</span>)}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {p.phone ? <a className="btn" href={`tel:${p.phone}`}>Call</a> : null}
        {p.email ? <a className="btn" href={`mailto:${p.email}`}>Email</a> : null}
        {p.website ? <a className="btn" target="_blank" rel="noopener noreferrer" href={normalizeUrl(p.website)}>Website</a> : null}
        {p.address ? <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(p.address)}`}>Map</a> : null}
      </div>
    </article>
  )
}
