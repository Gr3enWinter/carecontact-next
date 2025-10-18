import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { adminClient } from '../../../../src/lib/supabaseServer'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
const topics = [
  '10 Questions to Ask a Home Care Provider',
  'Understanding Medicare Coverage for Assisted Living',
  'How to Spot Elder Abuse'
]
function slugify(s: string){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') }
async function fetchPexelsImage(query: string){
  const key = process.env.PEXELS_API_KEY
  if(!key) return null
  try{
    const res = await fetch(`https://api.pexels.com/v1/search?per_page=1&query=${encodeURIComponent(query)}`, { headers: { Authorization: key } })
    if(!res.ok) return null
    const json = await res.json()
    const photo = json?.photos?.[0]
    return photo?.src?.large || photo?.src?.medium || null
  }catch{return null}
}
export async function GET(){
  const topic = topics[Math.floor(Math.random() * topics.length)]
  const apiKey = process.env.OPENAI_API_KEY
  if(!apiKey) return NextResponse.json({ ok:false, error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  const client = new OpenAI({ apiKey })
  const sys = 'You are a precise, neutral health/elder-care writer. Use H2/H3 headings, short paragraphs, bullets; include a short FAQ. Avoid medical advice.'
  const user = `Write a blog post titled: "${topic}" for families and care coordinators.`
  const chat = await client.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role:'system', content: sys }, { role:'user', content: user }], temperature: 0.4 })
  let html = chat.choices[0].message?.content || ''
  const hero = await fetchPexelsImage(topic)
  if(hero){ html = `<figure style="margin:0 0 16px 0"><img alt="${topic}" src="${hero}" style="width:100%;height:auto;border-radius:16px;border:1px solid #e6eaf2" /></figure>` + html }
  const supa = adminClient()
  const slug = slugify(topic)
  const { error } = await supa.from('posts').insert({ slug, title: topic, html })
  if(error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })
  try{ revalidatePath('/blog') }catch{}
  return NextResponse.json({ ok: true, slug, hero: !!hero })
}
