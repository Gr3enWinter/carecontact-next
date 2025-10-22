// app/suggest/page.tsx
'use client';

import { useState } from 'react';

type Kind = 'provider' | 'clinician';

export default function SuggestPage() {
  const [kind, setKind] = useState<Kind>('provider');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOk(null); setErr(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);

    // honeypot: if filled, silently succeed to confuse bots
    const trap = String(fd.get('company') || '').trim();
    if (trap) {
      setLoading(false);
      setOk('Thanks!'); // pretend success
      (e.target as HTMLFormElement).reset();
      return;
    }

    const payload = {
      kind: fd.get('kind') as Kind,
      name: String(fd.get('name') || '').trim(),
      website: String(fd.get('website') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      address: String(fd.get('address') || '').trim(),
      city: String(fd.get('city') || '').trim(),
      state: String(fd.get('state') || '').trim(),
      zip: String(fd.get('zip') || '').trim(),
      specialty: String(fd.get('specialty') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    };

    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Failed');
      setOk('Thanks! We’ll review and add it soon.');
      (e.target as HTMLFormElement).reset();
    } catch (e:any) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container py-10 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Suggest a {kind === 'provider' ? 'Provider' : 'Doctor'}</h1>
      <p className="text-slate-600 mb-6">
        See something missing? Send it our way. We verify suggestions before publishing.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 card p-6">
        {/* kind toggle */}
        <div className="flex gap-2">
          {(['provider','clinician'] as Kind[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-2 rounded-md border ${kind===k ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300'}`}
            >
              {k === 'provider' ? 'Provider' : 'Clinician'}
            </button>
          ))}
          <input type="hidden" name="kind" value={kind}/>
        </div>

        {/* honeypot */}
        <input name="company" className="hidden" tabIndex={-1} autoComplete="off" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Name *</label>
            <input name="name" required placeholder="Business or doctor's name" />
          </div>
          <div>
            <label className="block text-sm font-medium">Website</label>
            <input name="website" type="url" placeholder="https://example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input name="phone" placeholder="(555) 555-1212" />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input name="email" type="email" placeholder="info@example.com" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Address</label>
            <input name="address" placeholder="123 Main St Suite 100" />
          </div>

          <div>
            <label className="block text-sm font-medium">City</label>
            <input name="city" />
          </div>
          <div>
            <label className="block text-sm font-medium">State</label>
            <input name="state" maxLength={2} placeholder="NY" />
          </div>
          <div>
            <label className="block text-sm font-medium">ZIP</label>
            <input name="zip" inputMode="numeric" />
          </div>
          <div>
            <label className="block text-sm font-medium">Specialty / Service</label>
            <input name="specialty" placeholder="Family medicine, pediatrics, home health…" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Notes</label>
            <textarea name="notes" rows={4} placeholder="Anything we should know?" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Sending…' : 'Submit'}</button>
          {ok && <span className="text-green-700">{ok}</span>}
          {err && <span className="text-red-700">{err}</span>}
        </div>
      </form>
    </div>
  );
}
