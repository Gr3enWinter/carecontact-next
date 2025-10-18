import { NextResponse } from 'next/server'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'

function csvParse(text: string){
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++){
    const cols = lines[i].split(',')
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => obj[h] = (cols[idx] || '').trim())
    rows.push(obj)
  }
  return rows
}

export async function POST(req: Request){
  const token = req.headers.get('x-admin-token') || ''
  const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
  if (!expected || token !== expected){
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const text = await req.text()
  const rows = csvParse(text)
  if (!rows.length) return NextResponse.json({ error: 'No rows' }, { status: 400 })

  const supa = adminClient()
  const payload = rows.map(r => ({
    name: r.name, phone: r.phone || null, email: r.email || null,
    address: r.address || null, city: r.city || null, state: r.state || null, zip: r.zip || null,
    website: r.website || null, services: r.services || null,
    featured: (r.featured || '').toLowerCase() === 'true'
  }))

  const { error, count } = await supa.from('providers').insert(payload, { count: 'exact' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: count || payload.length })
}
