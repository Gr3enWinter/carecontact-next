import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 30

type Out = {
  slug?: string
  name?: string
  website?: string
  phone?: string|null
  email?: string|null
  address?: string|null
  city?: string|null
  state?: string|null
  zip?: string|null
  services?: string|null
  logo_url?: string|null
  description?: string|null
}

function norm(u: string){ return /^https?:\/\//i.test(u) ? u : `https://${u}` }
function abs(base: string, href?: string|null){
  if(!href) return; try { return new URL(href, base).toString() } catch {}
}
async function get(url: string){
  const r = await fetch(url, { redirect: 'follow' })
  if(!r.ok) throw new Error(`GET ${r.status}`)
  return r.text()
}
function segSlugFromUrl(url: string){
  try {
    const u = new URL(url)
    // take last non-empty segment
    const parts = u.pathname.split('/').filter(Boolean)
    return parts[parts.length-1]?.toLowerCase() || u.hostname.replace(/^www\./,'')
  } catch { return undefined }
}
function slugify(s: string){
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
}

/** very small detail-page scraper (no AI) */
async function scrapeDetail(url: string): Promise<Out>{
  const html = await get(url)
  const $ = cheerio.load(html)

  const title =
    $('meta[property="og:title"]').attr('content')?.trim()
    || $('h1').first().text().trim()
    || $('title').first().text().trim()
    || new URL(url).hostname.replace(/^www\./,'')

  const description =
    $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || null

  // logo/icon candidates
  const logo =
    $('meta[property="og:logo"]').attr('content')
    || $('link[rel="apple-touch-icon"][sizes]').attr('href')
    || $('link[rel="apple-touch-icon"]').attr('href')
    || $('link[rel="icon"][sizes]').attr('href')
    || $('link[rel="icon"]').attr('href')
    || '/favicon.ico'

  // phones
  const phone =
    $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/,'').trim()
    || ($('body').text().match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)?.[0] ?? null)

  // email
  const email =
    $('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/,'').trim()
    || (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null)

  // address: JSON-LD first
  let address: string|null = null, city: string|null = null, state: string|null = null, zip: string|null = null
  $('script[type="application/ld+json"]').each((_,el)=>{
    try {
      const j = JSON.parse($(el).contents().text())
      const nodes = Array.isArray(j) ? j : [j]
      for(const n of nodes){
        const a = n?.address || n?.location?.address
        if(a){
          address = address || [a.streetAddress, a.address2].filter(Boolean).join(' ').trim() || null
          city    = city    || a.addressLocality || null
          state   = state   || a.addressRegion   || null
          zip     = zip     || a.postalCode      || null
        }
        if(n?.telephone && !phone){ /* keep phone if JSON-LD offers */ }
      }
    }catch{}
  })

  // fallback: address-like blocks
  if(!address){
    const sel = $('address').first().text().trim()
      || $('[class*="address"], [id*="address"]').first().text().trim()
    if(sel){
      const t = sel.replace(/\s+/g,' ')
      // try to split last "City, ST 12345"
      const m = t.match(/(.+?)\s+([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/)
      if(m){
        address = m[1].trim()
        city = m[2].trim()
        state = m[3].trim()
        zip = m[4].trim()
      } else {
        address = t
      }
    }
  }

  const logoAbs = abs(url, logo) || null

  return {
    slug: segSlugFromUrl(url) || slugify(title),
    name: title,
    website: url,
    phone: phone || null,
    email: email || null,
    address, city, state, zip,
    logo_url: logoAbs,
    description,
    services: null
  }
}

/** extract practice links from a directory page (with rules for communitycare.com) */
function extractPracticeLinks(dirUrl: string, $: cheerio.CheerioAPI){
  const out = new Set<string>()
  const add = (href?: string|null) => { const u = abs(dirUrl, href); if(u) out.add(u) }

  // 1) Site-specific selector for Community Care directory cards (robust guesses)
  // Cards often use <a class="practice-card|location-card|card"> or links under /practices/{slug}/
  $('a[href]').each((_,a)=>{
    const h = $(a).attr('href') || ''
    if (/\/practices\/[a-z0-9-]+\/?$/i.test(h)) add(h)
  })

  // 2) Generic fallbacks (detail/profile-ish links)
  $('a[href*="practice"], a[href*="location"], a[href*="clinic"], a[href*="center"]').each((_,a)=>{
    const h = $(a).attr('href') || ''
    if (/\/(practice|practices|location|clinic|center)\/[a-z0-9-]+\/?$/i.test(h)) add(h)
  })

  // filter obvious list pages and duplicates
  return Array.from(out)
    .filter(u => !/\/(practices|locations|doctors)\/?$/.test(u))
}

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const url = norm(searchParams.get('url') || '')
  const insert = (searchParams.get('insert')||'false').toLowerCase()==='true'
  const token = req.headers.get('x-admin-token') || ''
  const maxPages = Math.max(1, Math.min(100, parseInt(searchParams.get('maxPages')||'20', 10)))

  if(!url) return NextResponse.json({ ok:false, error:'Missing url' }, { status:400 })

  // Load directory page and collect detail links
  const html = await get(url)
  const $ = cheerio.load(html)
  let links = extractPracticeLinks(url, $)

  // If nothing matched (markup changes), fall back to all anchors under /practices/
  if(links.length === 0 && /\/practices\/?$/i.test(url)){
    $('a[href]').each((_,a)=>{
      const h = $(a).attr('href') || ''
      if(/\/practices\/[a-z0-9-]+\/?$/i.test(h)) {
        const u = abs(url, h); if(u) links.push(u)
      }
    })
  }

  // Cap total detail pages to visit
  links = Array.from(new Set(links)).slice(0, maxPages)

  // Scrape each detail page
  const bySlug = new Map<string, Out>()
  for(const u of links){
    try{
      const p = await scrapeDetail(u)
      if(!p.slug) continue
      // Prefer the first we see; if another with same slug appears, skip (dedupe)
      if(!bySlug.has(p.slug)) bySlug.set(p.slug, p)
    }catch{}
  }
  const providers = Array.from(bySlug.values())

  // Optional upsert (dedup at DB level by slug)
  if(insert && providers.length){
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if(!expected || token !== expected){
      return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
    }
    const supa = adminClient()
    // upsert by slug (requires unique index on lower(slug))
    const { error } = await supa.from('providers')
      .upsert(
        providers.map(p => ({ ...p, slug: (p.slug || '').toLowerCase() })),
        { onConflict: 'slug', ignoreDuplicates: false }
      )
    if(error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  return NextResponse.json({
    ok: true,
    data: providers,
    meta: { mode:'directory', count: providers.length, timestamp: new Date().toISOString() }
  })
}
