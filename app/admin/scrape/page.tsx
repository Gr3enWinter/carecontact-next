'use client'
import { useEffect, useState } from 'react'

type Out = {
  name?: string
  website?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  services?: string | null
  logo_url?: string | null
  description?: string | null
}

export default function ScrapeAdmin(){
  const [ok, setOk] = useState(false)
  const [url, setUrl] = useState('')
  const [data, setData] = useState<Out | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('ADMIN_TOKEN') || ''
    const env = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    setOk(!!t && !!env && t === env)
  }, [])

  async function doScrape(e: React.FormEvent){
    e.preventDefault()
    setMsg(null)
    setData(null)
    const u = url.trim()
    if(!u){ setMsg('Enter a website URL'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/scrape/provider?url=${encodeURIComponent(u)}`)
      const json = await res.json()
      if(!res.ok){ setMsg(json.error || 'Scrape failed'); return }
      setData(json.data as Out)
      setMsg('Scrape complete. Review and Save to providers.')
    } catch (err: any) {
      setMsg('Request failed')
    } finally {
      setLoading(false)
    }
  }

  function update<K extends keyof Out>(k: K, v: Out[K]) {
    setData(prev => prev ? { ...prev, [k]: v } : prev)
  }

  async function save(){
    if(!data) return
    setMsg('Saving…')
    const t = localStorage.getItem('ADMIN_TOKEN') || ''
    const res = await fetch(`/api/scrape/provider?url=${encodeURIComponent(data.website || url)}&insert=true`, {
      headers: { 'x-admin-token': t }
    })
    const json = await res.json()
    setMsg(res.ok ? 'Saved to providers' : `Error: ${json.error || 'failed'}`)
  }

  if(!ok){
    return (
      <div className="container py-10 max-w-lg">
        <h1 className="text-2xl font-bold mb-3">Admin: Scrape Provider</h1>
        <p className="text-sm text-ink-700">Go to <a className="btn" href="/admin">/admin</a> and enter your token first.</p>
      </div>
    )
  }

  return (
    <div className="container py-10 max-w-3xl">
      <h1 className="text-2xl font-bold mb-3">Scrape Provider</h1>
      <form onSubmit={doScrape} className="card space-y-3">
        <div>
          <label>Website URL</label>
          <input placeholder="https://example.com" value={url} onChange={e=>setUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={loading}>
          {loading ? 'Scraping…' : 'Scrape'}
        </button>
        {msg ? <div className="text-sm text-ink-700">{msg}</div> : null}
      </form>

      {data ? (
        <div className="card mt-4 space-y-3">
          <div className="flex gap-3 items-center">
            {data.logo_url ? <img src={data.logo_url} alt="" className="w-14 h-14 rounded-xl border object-cover" /> : null}
            <input value={data.name || ''} onChange={e=>update('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label>Website</label>
              <input value={data.website || ''} onChange={e=>update('website', e.target.value)} />
            </div>
            <div>
              <label>Phone</label>
              <input value={data.phone || ''} onChange={e=>update('phone', e.target.value)} />
            </div>
            <div>
              <label>Email</label>
              <input value={data.email || ''} onChange={e=>update('email', e.target.value)} />
            </div>
            <div>
              <label>Services (pipe-separated)</label>
              <input value={data.services || ''} onChange={e=>update('services', e.target.value)} />
            </div>
            <div>
              <label>Address</label>
              <input value={data.address || ''} onChange={e=>update('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label>City</label>
                <input value={data.city || ''} onChange={e=>update('city', e.target.value)} />
              </div>
              <div>
                <label>State</label>
                <input value={data.state || ''} onChange={e=>update('state', e.target.value)} />
              </div>
              <div>
                <label>ZIP</label>
                <input value={data.zip || ''} onChange={e=>update('zip', e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label>Logo URL</label>
              <input value={data.logo_url || ''} onChange={e=>update('logo_url', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label>Description</label>
              <textarea rows={4} value={data.description || ''} onChange={e=>update('description', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={save}>Save to providers</button>
            <a className="btn" href="/find-providers">View directory</a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
