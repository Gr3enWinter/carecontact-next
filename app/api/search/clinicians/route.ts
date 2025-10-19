import { NextResponse } from 'next/server'
import { adminClient } from '../../../../src/lib/supabaseServer'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') || '').trim()
  const practice = sp.get('practice') || undefined
  const supa = adminClient()
  let query = supa.from('clinicians')
    .select('practice_slug,slug,name,credentials,specialty,title,photo_url,profile_url')
    .limit(50)

  if (q)        query = query.ilike('name', `%${q}%`)
  if (practice) query = query.eq('practice_slug', practice)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status: 500 })
  return NextResponse.json({ ok:true, data })
}
