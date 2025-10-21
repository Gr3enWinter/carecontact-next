// src/components/ProviderCard.tsx
'use client'

type Provider = {
  id: string | number
  slug?: string | null
  name: string
  description?: string | null
  logo_url?: string | null
  website?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  services?: string | null
}

function initials(s: string) {
  return s.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function ProviderCard({ p }: { p: Provider }) {
  const loc = [p.city, p.state].filter(Boolean).join(', ')
  const desc = (p.description || '').replace(/\s+/g, ' ').slice(0, 160)

  return (
    <article className="card flex items-start gap-4">
      {/* avatar / logo */}
      {p.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.logo_url} alt={p.name} className="w-16 h-16 object-cover rounded-xl border" />
      ) : (
        <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-semibold">
          {initials(p.name)}
        </div>
      )}

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">
            {p.slug ? <a className="hover:underline" href={`/providers/${p.slug}`}>{p.name}</a> : p.name}
          </h3>
          {p.services && (
            <span className="badge ml-1">{p.services.split('|')[0]}</span>
          )}
        </div>

        {loc && <div className="text-sm text-slate-600 mt-0.5">{loc}</div>}

        {desc && <p className="mt-2 text-slate-700">{desc}{p.description && p.description.length > 160 ? '…' : ''}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          {p.website && <a className="btn" href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">Website</a>}
          {p.phone && <a className="btn" href={`tel:${p.phone}`}>Call</a>}
          {p.email && <a className="btn" href={`mailto:${p.email}`}>Email</a>}
          {p.slug && <a className="btn" href={`/providers/${p.slug}`}>Details</a>}
        </div>
      </div>
    </article>
  )
}
