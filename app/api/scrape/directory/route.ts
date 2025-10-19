import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 30

type Out = {
  name?: string; website?: string; phone?: string|null; email?: string|null;
  address?: string|null; city?: string|null; state?: string|null; zip?: string|null;
  services?: string|null; logo_url?: string|null; description?: string|null;
}

function abs(base: string, href?: string|null){ if(!href) return; try{ return new URL(href, base).toString() }catch{} }
function norm(url: string){ return /^https?:\/\//i.test(url) ? url : `https://${url}` }
async function get(url: string){ const r = await fetch(url, {redirect:'follow'}); if(!r.ok) throw new Error(`GET ${r.status}`); return r.text() }

async function scrapeWebsite(website: string): Promise<Out>{
  const html = await get(website); const $ = cheerio.load(html)
  const title = ($('meta[property="og:site_name"]').attr('content') || $('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim()
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null)?.trim() || null
  const logo = $('link[rel="apple-touch-icon"]').attr('href') || $('link[rel="icon"]').attr('href') || '/favicon.ico'
  const phone = $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/,'') || null
  const email = (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null)
  // JSON-LD address (best-effort)
  let address:null|string=null, city:null|string=null, state:null|string=null, zip:null|string=null
  $('script[type="application/ld+json"]').each((_,el)=>{ try{
    const j = JSON.parse($(el).contents().text()); const a = (Array.isArray(j)?j:[j]).find((n:any)=>n.address)?.address
    if(a){ address = [a.streetAddress,a.address2].filter(Boolean).join(' ').trim()||address; city=a.addressLocality||city; state=a.addressRegion||state; zip=a.postalCode||zip }
  }catch{} })
  return { name: title || new URL(website).hostname.replace(/^www\./,''), website, phone, email, address, city, state, zip, logo_url: abs(website,logo)||null, description, services: null }
}

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const url = norm(searchParams.get('url')||'')
  const maxPages = Math.max(1, Math.min(50, Number(searchParams.get('maxPages')||'10')))
  const insert = (searchParams.get('insert')||'false').toLowerCase()==='true'
  const token = req.headers.get('x-admin-token')||''

  if(!url) return NextResponse.json({ ok:false, error:'Missing url' }, { status:400 })

  // 1) Load directory page and collect candidate links
  const html = await get(url); const $ = cheerio.load(html)
  // Links that look like detail pages
  const patterns = /(practice|provider|profile|location|agency|care|center|services)/i
  const links = new Set<string>()
  $('a[href]').each((_,a)=>{ const h=$(a).attr('href')||''; const u=abs(url,h); if(!u) return; if(!patterns.test(u)) return; if(u.includes('#')) return; links.add(u) })
  const targets = Array.from(links).slice(0, maxPages)

  // 2) Scrape each target
  const providers: Out[] = []
  for(const u of targets){
    try{ providers.push(await scrapeWebsite(u)) }catch(_){}
  }

  // 3) Optional bulk insert
  if(insert){
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN||'').trim()
    if(!expected || token !== expected){ return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 }) }
    const supa = adminClient()
    const { error } = await supa.from('providers').insert(providers)
    if(error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, data: providers, meta:{ mode:'directory', count: providers.length, timestamp: new Date().toISOString() } })
}
