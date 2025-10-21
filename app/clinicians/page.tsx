// app/clinicians/page.tsx
import { createClient } from '@supabase/supabase-js'
import ClinicianCard, { Clinician } from '../../src/components/ClinicianCard'

export const revalidate = 60
export const dynamic = 'force-static'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function CliniciansPage() {
  const { data, error } = await supabase
    .from('clinicians')
    .select(
      'practice_slug,slug,name,role,profile_url,photo_url,specialties,languages,accepting_new_patients,last_seen_at,booking_url'
    )
    .order('last_seen_at', { ascending: false })
    .limit(60)

  if (error) {
    return (
      <div className="container py-10">
        Error: {error.message}
      </div>
    )
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
