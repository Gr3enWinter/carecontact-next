'use client'
import { useEffect, useState } from 'react'

export default function AdminPage(){
  const [ok, setOk] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('ADMIN_TOKEN') || ''
    const env = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    setOk(!!t && env && t === env)
  }, [])

  function login(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    const token = (new FormData(e.currentTarget).get('token') as string || '').trim()
    if (token){
      localStorage.setItem('ADMIN_TOKEN', token)
      const env = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
      setOk(env && token === env)
    }
  }

  async function uploadCsv(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    setMsg(null)
    const file = (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0]
    if(!file) return
    const text = await file.text()
    const res = await fetch('/api/providers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'x-admin-token': localStorage.getItem('ADMIN_TOKEN') || '' },
      body: text
    })
    const json = await res.json()
    setMsg(res.ok ? `Imported ${json.count || 0} providers` : `Error: ${json.error}`)
  }

  if(!ok){
    return (
      <div className="container py-10 max-w-lg">
        <h1 className="text-2xl font-bold mb-3">Admin login</h1>
        <form onSubmit={login} className="card space-y-3">
          <div>
            <label>Admin token</label>
            <input name="token" placeholder="Enter admin token" />
          </div>
          <button className="btn btn-primary">Continue</button>
        </form>
        <p className="text-sm text-ink-700 mt-3">Set <code>NEXT_PUBLIC_ADMIN_TOKEN</code> in env, then enter it here once.</p>
      </div>
    )
  }

  return (
    <div className="container py-10 max-w-2xl">
      <h1 className="text-2xl font-bold mb-3">Provider Import</h1>
      <form onSubmit={uploadCsv} className="card space-y-3">
        <div>
          <label>Upload CSV</label>
          <input name="file" type="file" accept=".csv,text/csv" />
        </div>
        <p className="text-sm text-ink-700">Headers: <code>name,phone,email,address,city,state,zip,website,services,featured</code></p>
        <button className="btn btn-primary">Import</button>
      </form>
      {msg ? <div className="card mt-4">{msg}</div> : null}
    </div>
  )
}
