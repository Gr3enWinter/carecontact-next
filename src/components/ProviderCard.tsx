// src/components/ProviderCard.tsx
import React from 'react'

const trim = (s?: string | null, n = 180) =>
  s ? (s.length > n ? s.slice(0, n - 1) + '…' : s) : ''

const fmtPhone = (p?: string | null) =>
  p && /^\d{10}$/.test(p) ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : null

export default function ProviderCard({ p }: { p: any }) {
  const phoneFmt = fmtPhone(p.phone)
  const hasLoc = p.city || p.state || p.zip

  return (
    <article className="card flex gap-4">
      <div className="h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
        {p.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo_url} alt={p.name || 'Logo'} className="h-full w-full object-cover" />
        ) : (
          <span className="font-bold text-slate-500">CCP</span>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-lg md:text-xl font-semibold">{p.name || 'Practice'}</h3>

        {hasLoc && (
          <div className="text-slate-500 text-sm mt-1">
            {[p.city, p.state, p.zip].filter(Boolean).join(', ')}
          </div>
        )}

        {p.description && <p className="text-slate-700 mt-2">{trim(p.description)}</p>}

        <div className="flex flex-wrap gap-2 mt-3">
          {phoneFmt && (
            <a className="btn" href={`tel:${p.phone}`}>Call</a>
          )}
          {p.email && (
            <a className="btn" href={`mailto:${p.email}`}>Email</a>
          )}
          {p.website && (
            <a className="btn" target="_blank" rel="noopener noreferrer" href={p.website}>Website</a>
          )}
          {p.address && (
            <a
              className="btn"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://maps.google.com/?q=${encodeURIComponent(p.address)}`}
            >
              Map
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
