// app/providers/[slug]/page.tsx
import { createClient } from '@supabase/supabase-js'
import ClinicianCard, { Clinician } from '../../../src/components/ClinicianCard'

export const dynamic = 'force-dynamic'

function formatPhone(p?: string | null) {
  if (!p) return null
  const digits = p.replace(/\D/g, '')
  const m = digits.match(/^1?(\d{3})(\d{3})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p
}

export default async function ProviderDetail({
  params,
}: {
  params: { slug: string }
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return (
      <div className="container py-10">
        Provider not found (missing Supabase env vars).
      </div>
    )
  }

  const supabase = createClient(url, anon)

  const { data: provider, error: pErr } = await supabase
    .from('providers')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (pErr || !provider) {
    return <div className="container py-10">Provider not found.</div>
  }

  const { data: clinicians, error: cErr } = await supabase
    .from('clinicians')
    .select(
      'practice_slug,slug,name,role,profile_url,photo_url,specialties,languages,accepting_new_patients,booking_url'
    )
    .eq('practice_slug', params.slug)
    .order('name', { ascending: true })

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-start gap-6">
        {provider.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={provider.logo_url}
            alt={provider.name ?? provider.slug}
            className="w-36 h-36 object-cover rounded-xl border"
          />
        ) : null}

        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{provider.name ?? provider.slug}</h1>
          {provider.description ? (
            <p className="text-slate-600 mt-2 max-w-2xl">
              {provider.description}
            </p>
          ) : null}

          <div className="mt-3 text-sm text-slate-700 space-y-1">
            {provider.address && (
              <div>
                {provider.address}
                {provider.city ? `, ${provider.city}` : ''}
                {provider.state ? `, ${provider.state}` : ''}
                {provider.zip ? ` ${provider.zip}` : ''}
              </div>
            )}
            {provider.phone && <div>{formatPhone(provider.phone)}</div>}
            {provider.website && (
              <div>
                <a
                  className="text-blue-600 hover:underline"
                  href={
                    /^https?:\/\//i.test(provider.website)
                      ? provider.website
                      : `https://${provider.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {provider.website}
                </a>
              </div>
            )}
            {provider.services && (
              <div className="text-slate-600">
                <span className="font-medium">Services:</span> {provider.services}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Clinicians</h2>
        {cErr ? (
          <div className="text-red-600 text-sm">
            Error loading clinicians: {cErr.message}
          </div>
        ) : !clinicians || clinicians.length === 0 ? (
          <div className="text-slate-600">
            No clinicians listed for this practice yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {clinicians.map((c) => (
              <ClinicianCard key={`${c.practice_slug}:${c.slug}`} c={c as Clinician} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
