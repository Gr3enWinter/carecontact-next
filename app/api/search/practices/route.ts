import { NextResponse } from 'next/server'
import { adminClient } from '../../../../src/lib/supabaseServer'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  const supa = adminClient()
  let query = supa.from('providers').select('slug,name,city,state,website,logo_url').limit(25)
  if (q) query = query.ilike('name', `%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status: 500 })
  return NextResponse.json({ ok:true, data })
}
