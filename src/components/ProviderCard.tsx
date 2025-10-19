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
  logo_url?: string | null
  description?: string | null
}

function normalizeUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

function snippet(s?: string | null, n = 220){
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

export default function ProviderCard({ p }: { p: Provider }){
  const services = (p.services || '').split('|').map(s => s.trim()).filter(Boolean)
  const site = normalizeUrl(p.website)
  const logo = normalizeUrl(p.logo_url)

  return (
    <article className="card">
      <div className="flex gap-4">
        <div className="shrink-0">
          {logo ? (
            <img src={logo} alt={p.name} className="w-16 h-16 rounded-xl border object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-xl border bg-ink-50 flex items-center justify-center text-ink-700 text-sm">
              {(p.name || '').slice(0,2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold truncate">{p.name}</h3>
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
          {p.description ? (<p className="text-ink-700 mt-3">{snippet(p.description)}</p>) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {p.phone ? <a className="btn" href={`tel:${p.phone}`}>Call</a> : null}
            {p.email ? <a className="btn" href={`mailto:${p.email}`}>Email</a> : null}
            {site ? <a className="btn" target="_blank" rel="noopener noreferrer" href={site}>Website</a> : null}
            {p.address ? (
              <a className="btn" target="_blank" rel="noopener noreferrer"
                 href={`https://maps.google.com/?q=${encodeURIComponent(p.address)}`}>Map</a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
