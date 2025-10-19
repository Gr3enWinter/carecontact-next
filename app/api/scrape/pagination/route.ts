import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

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

// very small single-site scraper (same as in directory)
async function scrapeWebsite(website: string): Promise<Out>{
  const html = await get(website); const $ = cheerio.load(html)
  const title = ($('meta[property="og:site_name"]').attr('content') || $('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim()
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null)?.trim() || null
  const logo = $('link[rel="apple-touch-icon"]').attr('href') || $('link[rel="icon"]').attr('href') || '/favicon.ico'
  const phone = $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/,'') || null
  const email = (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null)
  let address:null|string=null, city:null|string=null, state:null|string=null, zip:null|string=null
  $('script[type="application/ld+json"]').each((_,el)=>{ try{
    const j = JSON.parse($(el).contents().text()); const a = (Array.isArray(j)?j:[j]).find((n:any)=>n.address)?.address
    if(a){ address=[a.streetAddress,a.address2].filter(Boolean).join(' ').trim()||address; city=a.addressLocality||city; state=a.addressRegion||state; zip=a.postalCode||zip }
  }catch{} })
  return { name: title || new URL(website).hostname.replace(/^www\./,''), website, phone, email, address, city, state, zip, logo_url: abs(website,logo)||null, description, services: null }
}

function findNext($: cheerio.CheerioAPI, base: string){
  const rel = $('link[rel="next"]').attr('href')
  if (rel) return abs(base, rel)
  let next: string|undefined
  $('a').each((_,a)=>{
    const t = ($(a).text()||'').toLowerCase()
    if (/(next|older|»|›)/.test(t)){ const u = abs(base, $(a).attr('href')); if(u) next = u }
  })
  return next
}

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const startUrl = norm(searchParams.get('url')||'')
  const maxPages = Math.max(1, Math.min(50, Number(searchParams.get('maxPages')||'10')))
  const insert = (searchParams.get('insert')||'false').toLowerCase()==='true'
  const token = req.headers.get('x-admin-token')||''

  if(!startUrl) return NextResponse.json({ ok:false, error:'Missing url' }, { status:400 })

  const visited = new Set<string>()
  const pageUrls: string[] = []
  let cursor: string|undefined = startUrl

  // walk pagination
  while (cursor && pageUrls.length < maxPages){
    if (visited.has(cursor)) break
    visited.add(cursor); pageUrls.push(cursor)
    try {
      const html = await get(cursor); const $ = cheerio.load(html)
      cursor = findNext($, cursor)
    } catch {
      break
    }
  }

  // from each page, collect detail links → scrape
  const detail = new Set<string>()
  const pat = /(practice|provider|profile|location|agency|care|center|services)/i
  for (const p of pageUrls){
    try {
      const html = await get(p); const $ = cheerio.load(html)
      $('a[href]').each((_,a)=>{ const u=abs(p,$(a).attr('href')); if(!u) return; if(!pat.test(u)) return; if(u.includes('#')) return; detail.add(u) })
    } catch {}
  }

  const targets = Array.from(detail).slice(0, maxPages) // cap
  const providers: Out[] = []
  for(const u of targets){
    try{ providers.push(await scrapeWebsite(u)) }catch(_){}
  }

  if(insert){
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN||'').trim()
    if(!expected || token !== expected){ return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 }) }
    const supa = adminClient()
    const { error } = await supa.from('providers').insert(providers)
    if(error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, data: providers, meta:{ mode:'pagination', pages: pageUrls.length, count: providers.length, timestamp: new Date().toISOString() } })
}
