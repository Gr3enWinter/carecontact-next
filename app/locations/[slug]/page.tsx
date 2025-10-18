import ProviderCard from '../../../src/components/ProviderCard'
import { adminClient } from '../../../src/lib/supabaseServer'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CityPage({ params }: { params: { slug: string } }){
  const supa = adminClient()
  const { data: city, error: cityErr } = await supa
    .from('cities')
    .select('city,state,slug')
    .eq('slug', params.slug)
    .maybeSingle()
  if (cityErr) throw cityErr
  if (!city) return notFound()

  const { data: providers, error } = await supa
    .from('providers')
    .select('id,name,phone,email,address,city,state,zip,website,services,featured')
    .eq('city', city.city)
    .eq('state', city.state)
    .order('featured', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw error

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">{city.city}, {city.state}</h1>
        <Link href="/find-providers" className="btn">Search all</Link>
      </div>
      <p className="text-ink-700 mt-2">Providers serving {city.city} and nearby areas.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {(providers || []).map(p => <ProviderCard key={p.id} p={p} />)}
      </div>
    </div>
  )
}
