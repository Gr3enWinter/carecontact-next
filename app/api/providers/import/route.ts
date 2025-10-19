import { NextResponse } from 'next/server'
import { adminClient } from '../../../../src/lib/supabaseServer'
export const runtime = 'nodejs'

// CSV parser supporting quoted fields and escaped quotes ("")
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } // escaped quote
        else { inQuotes = false }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (ch === '\r') { /* ignore */ }
      else { field += ch }
    }
  }
  // flush last field/row
  row.push(field)
  // avoid trailing empty row
  if (row.length === 1 && row[0].trim() === '') { /* skip */ }
  else { rows.push(row) }
  // drop blank rows
  return rows.filter(r => r.some(c => (c || '').trim() !== ''))
}

export async function POST(req: Request) {
  const token = req.headers.get('x-admin-token') || ''
  const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const text = await req.text()
  const grid = parseCSV(text)
  if (!grid.length) return NextResponse.json({ error: 'No data' }, { status: 400 })
  const header = grid[0].map(h => h.trim().toLowerCase())
  const rows = grid.slice(1)

  const idx = (name: string) => header.indexOf(name)
  const iName = idx('name')
  if (iName === -1) return NextResponse.json({ error: 'Missing "name" column' }, { status: 400 })

  const supa = adminClient()
  const payload = rows.map(cols => ({
    name: (cols[iName] || '').trim(),
    phone: (cols[idx('phone')] || '').trim() || null,
    email: (cols[idx('email')] || '').trim() || null,
    address: (cols[idx('address')] || '').trim() || null,
    city: (cols[idx('city')] || '').trim() || null,
    state: (cols[idx('state')] || '').trim() || null,
    zip: (cols[idx('zip')] || '').trim() || null,
    website: (cols[idx('website')] || '').trim() || null,
    services: (cols[idx('services')] || '').trim() || null,
    featured: ((cols[idx('featured')] || '').trim().toLowerCase() === 'true'),
    logo_url: (cols[idx('logo_url')] || '').trim() || null,
    description: (cols[idx('description')] || '').trim() || null,
  }))

  const { error, count } = await supa.from('providers').insert(payload, { count: 'exact' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: count || payload.length })
}
