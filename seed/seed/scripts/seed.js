/** Seed script for CareContact Next v1.1 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function readCSV(fp){
  const raw = fs.readFileSync(fp, 'utf8').trim()
  const [header, ...lines] = raw.split(/\r?\n/)
  const keys = header.split(',').map(s=>s.trim())
  return lines.map(line => {
    const vals = line.split(',').map(s=>s.trim())
    const obj = {}
    keys.forEach((k,i)=> obj[k] = vals[i] ?? '')
    return obj
  })
}

async function main(){
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if(!url || !key){ console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1) }
  const supa = createClient(url, key, { auth: { persistSession: false } })

  const root = process.cwd()
  const citiesPath = path.join(root, 'seed', 'data.cities.csv')
  const providersPath = path.join(root, 'seed', 'data.providers.csv')

  const cities = readCSV(citiesPath)
  const providers = readCSV(providersPath)

  const citiesPayload = cities.map(c => ({ slug: c.slug, city: c.city, state: c.state }))
  let { error: cErr } = await supa.from('cities').upsert(citiesPayload, { onConflict: 'slug' })
  if(cErr){ console.error('Cities upsert error:', cErr.message); process.exit(1) }
  console.log(`Upserted ${citiesPayload.length} cities`)

  const providersPayload = providers.map(p => ({
    name: p.name, phone: p.phone, email: p.email, address: p.address,
    city: p.city, state: p.state, zip: p.zip, website: p.website,
    services: p.services ? p.services.split('|') : [], featured: (p.featured||'').toLowerCase() === 'true'
  }))
  let { error: pErr } = await supa.from('providers').insert(providersPayload)
  if(pErr){ console.error('Providers insert error:', pErr.message); process.exit(1) }
  console.log(`Inserted ${providersPayload.length} providers`)

  console.log('Seed complete. Open /locations and /find-providers.')
}

main().catch(err => { console.error(err); process.exit(1) })
