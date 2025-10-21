// app/providers/[slug]/page.tsx
import { createClient } from '@supabase/supabase-js'
import ClinicianCard from '../../../src/components/ClinicianCard'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function ProviderDetail({ params }: { params: { slug: string } }) {
  const { data: p } = await supabase
    .from('providers')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!p) return <div className="container py-10">Provider not found.</div>

  const { data: clinicians } = await supabase
    .from('clinicians')
    .select('practice_slug,slug,name,role,profile_url,photo_url,specialties,languages,accepting_new_patients,booking_url')
    .eq('practice_slug', params.slug)
    .order('name', { ascending: true })

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-start gap-6">
        {p.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo_url} alt={p.name ?? p.slug} className="w-36 h-36 object-cover rounded-xl border" />
        ) : null}
        <div>
          <h1 className="text-3xl font-bold">{p.name ?? p.slug}</h1>
          {p.description ? <p className="text-slate-600 mt-2 max-w-2xl">{p.description}</p> : null}
          <div className="mt-3 text-sm text-slate-700 space-y-1">
            {p.address ? <div>{p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}{p.zip ? ` ${p.zip}` : ''}</div> : null}
            {p.phone ? <div>☎ {p.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}</div> : null}
            {p.website ? <a className="text-blue-600 hover:underline" href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank">Website</a> : null}
          </div>
        </div>
      </div>

      {clinicians?.length ? (
        <>
          <h2 className="text-xl font-semibold">Clinicians</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {clinicians.map((c) => <ClinicianCard key={`${c.practice_slug}:${c.slug}`} c={c as any} />)}
          </div>
        </>
      ) : null}
    </div>
  )
}
