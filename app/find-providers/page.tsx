import ProviderCard from '../../src/components/ProviderCard'
import { adminClient } from '../../src/lib/supabaseServer'

type SearchParams = {
  q?: string
  city?: string
  state?: string
  service?: string
}

function whereLike(col: string, val?: string){
  if(!val) return null
  return { col, val: `%${val}%` }
}

export const dynamic = 'force-dynamic'

export default async function ProvidersPage({ searchParams }: { searchParams: SearchParams }){
  const supa = adminClient()
  let query = supa.from('providers')
    .select('id,name,phone,email,address,city,state,zip,website,services,featured')
    .order('featured', { ascending: false })
    .order('name', { ascending: true })
    .limit(100)

  // simple filters
  const likeQ = whereLike('name', searchParams.q)
  const likeSvc = whereLike('services', searchParams.service)
  if (likeQ) query = query.ilike(likeQ.col, likeQ.val)
  if (searchParams.city) query = query.eq('city', searchParams.city)
  if (searchParams.state) query = query.eq('state', searchParams.state)
  if (likeSvc) query = query.ilike(likeSvc.col, likeSvc.val)

  const { data, error } = await query
  if (error) {
    return <div className="container py-10">Error loading providers.</div>
  }

  // fetch distinct states/cities for filters
  const { data: states } = await supa.from('providers').select('state').not('state','is',null)
  const { data: cities } = await supa.from('providers').select('city').not('city','is',null)
  const unique = (arr: any[], key: string) => Array.from(new Set((arr||[]).map(r => r[key]).filter(Boolean))).sort()

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-4">Find Providers</h1>

      <form className="card mb-6 grid grid-cols-1 md:grid-cols-4 gap-3" method="get">
        <div>
          <label>Search</label>
          <input name="q" defaultValue={searchParams.q || ''} placeholder="Name…" />
        </div>
        <div>
          <label>State</label>
          <select name="state" defaultValue={searchParams.state || ''}>
            <option value="">Any</option>
            {unique(states||[],'state').map((s:string) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>City</label>
          <select name="city" defaultValue={searchParams.city || ''}>
            <option value="">Any</option>
            {unique(cities||[],'city').map((c:string) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Service</label>
          <input name="service" defaultValue={searchParams.service || ''} placeholder="home care, assisted…" />
        </div>
        <div className="md:col-span-4">
          <button className="btn btn-primary">Apply filters</button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data || []).map((p: any) => <ProviderCard key={p.id} p={p} />)}
      </div>
    </div>
  )
}
