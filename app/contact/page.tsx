'use client'
import { useState } from 'react'

export default function Page() {
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget).entries())
    // TODO: wire to /api/leads; for now, just fake success
    console.log('lead', data)
    setSent(true)
  }

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-3">Request Help</h1>
      <p className="text-slate-700 max-w-2xl">
        Tell us your city and what you need. We’ll suggest 3–5 options within one business day.
      </p>

      {!sent ? (
        <form onSubmit={onSubmit} className="card mt-6 space-y-3 max-w-xl">
          <div>
            <label className="block text-sm text-slate-600">Your name</label>
            <input name="name" required className="w-full" />
          </div>
          <div>
            <label className="block text-sm text-slate-600">Email</label>
            <input name="email" type="email" required className="w-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-slate-600">City</label>
              <input name="city" className="w-full" />
            </div>
            <div>
              <label className="block text-sm text-slate-600">State</label>
              <input name="state" className="w-full" />
            </div>
            <div>
              <label className="block text-sm text-slate-600">Service</label>
              <input name="service" placeholder="Home care, assisted living..." className="w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600">Notes</label>
            <textarea name="notes" rows={4} className="w-full" />
          </div>
          <button className="btn btn-primary">Send</button>
        </form>
      ) : (
        <div className="card mt-6">
          Thanks—we’ll email you shortly with a short list.
        </div>
      )}
    </div>
  )
}
