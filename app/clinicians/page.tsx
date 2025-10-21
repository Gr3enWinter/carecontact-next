// app/clinicians/page.tsx
import { createClient } from '@supabase/supabase-js'
import ClinicianCard, { Clinician } from '../../src/components/ClinicianCard'

// render at request time so we don't need env vars at build
export const dynamic = 'force-dynamic'

export default async function CliniciansPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    // Friendly message if envs aren’t set yet
    return (
      <div className="container py-10">
        <h1 className="text-2xl font-bold">Clinicians</h1>
        <p className="mt-2 text-slate-600">
          Supabase environment variables are missing. Set
          {' '}<code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    )
  }

  const supabase = createClient(url, anon)

  const { data, error } = await supabase
    .from('clinicians')
    .select(
      'practice_slug,slug,name,role,profile_url,photo_url,specialties,languages,accepting_new_patients,last_seen_at,booking_url'
    )
    .order('last_seen_at', { ascending: false })
    .limit(60)

  if (error) {
    return <div className="container py-10">Error: {error.message}</div>
  }

  return (
    <div className="container py-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Clinicians</h1>

      {!data || data.length === 0 ? (
        <div className="text-slate-600">No clinicians yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.map((c) => (
            <ClinicianCard key={`${c.practice_slug}:${c.slug}`} c={c as Clinician} />
          ))}
        </div>
      )}
    </div>
  )
}
