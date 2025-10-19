import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'

type ScrapeOut = {
  name?: string
  website?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  services?: string | null
  logo_url?: string | null
  description?: string | null
}

function normUrl(url: string){
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}
function abs(base: string, maybe: string | undefined){
  if (!maybe) return undefined
  try { return new URL(maybe, base).toString() } catch { return undefined }
}
function pick<T>(obj: T, keys: (keyof T)[]) {
  const out: Partial<T> = {}
  keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k] })
  return out
}

function parseJsonLdAddress(jsonld: any): Partial<ScrapeOut> {
  const postal = jsonld?.address || (Array.isArray(jsonld) ? jsonld.find((n:any)=>n['@type']==='PostalAddress')?.address : null)
  if (!postal) return {}
  return {
    address: [postal.streetAddress, postal.address2].filter(Boolean).join(' ').trim() || null,
    city: postal.addressLocality || null,
    state: postal.addressRegion || null,
    zip: postal.postalCode || null,
  }
}

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const website = normUrl(searchParams.get('url') || '')
  const insert = (searchParams.get('insert') || 'false').toLowerCase() === 'true'
  const token = req.headers.get('x-admin-token') || ''

  if (!website) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // very light robots.txt check (single page)
  try {
    const robotsURL = new URL('/robots.txt', website).toString()
    const r = await fetch(robotsURL, { redirect: 'follow' })
    if (r.ok) {
      const txt = await r.text()
      // If site disallows all (*) and a generic "Disallow: /", decline
      const blocksAll = /^\s*User-agent:\s*\*\s*[^]*?Disallow:\s*\/\s*$/im.test(txt)
      if (blocksAll) return NextResponse.json({ error: 'Blocked by robots.txt' }, { status: 451 })
    }
  } catch {}

  // fetch the page
  const res = await fetch(website, { redirect: 'follow' })
  if (!res.ok) return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 })
  const html = await res.text()
  const $ = cheerio.load(html)

  // title / meta / og
  const title = ($('meta[property="og:site_name"]').attr('content')
    || $('meta[property="og:title"]').attr('content')
    || $('title').first().text()
  )?.trim()

  const description = (
    $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
  )?.trim() || null

  // logo/favicon candidates
  const logo =
    $('meta[property="og:logo"]').attr('content')
    || $('link[rel="apple-touch-icon"]').attr('href')
    || $('link[rel="icon"]').attr('href')
    || '/favicon.ico'

  // phone/email (simple regex pass)
  const clean = $.text().replace(/\s+/g,' ')
  const phoneMatch = clean.match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)
  const emailMatch = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)

  // address via JSON-LD (schema.org)
  let addr: Partial<ScrapeOut> = {}
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text())
      const nodes = Array.isArray(json) ? json : [json]
      for (const node of nodes) {
        if (node['@type'] === 'Organization' || node['@type'] === 'LocalBusiness') {
          if (!addr.address) addr = { ...addr, ...parseJsonLdAddress(node) }
          if (!addr.phone && node.telephone) addr.phone = String(node.telephone)
          if (!addr.email && node.email) addr.email = String(node.email)
        }
        if (node['@type'] === 'PostalAddress') {
          addr = { ...addr, ...parseJsonLdAddress({ address: node }) }
        }
      }
    } catch {}
  })

  // services keyword scan (pure keyword match—no AI)
  const svcKeywords = [
    'home care','home health','assisted living','memory care','dementia care',
    'skilled nursing','rehab','respite','hospice','caregiver','companionship'
  ]
  const found = new Set<string>()
  const lc = html.toLowerCase()
  svcKeywords.forEach(k => { if (lc.includes(k)) found.add(k) })
  const services = Array.from(found).join('|') || null

  const out: ScrapeOut = {
    name: title || undefined,
    website,
    phone: addr.phone || phoneMatch?.[0] || null,
    email: addr.email || emailMatch?.[0] || null,
    address: addr.address || null,
    city: addr.city || null,
    state: addr.state || null,
    zip: addr.zip || null,
    services,
    logo_url: abs(website, logo) || null,
    description,
  }

  if (!insert) return NextResponse.json({ ok: true, data: out })

  // insert path requires token
  const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // minimal required field: name
  if (!out.name) out.name = new URL(website).hostname.replace(/^www\./,'')
  const supa = adminClient()
  const { error } = await supa.from('providers').insert(pick(out, [
    'name','website','phone','email','address','city','state','zip','services','logo_url','description'
  ]) as any)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, saved: true, data: out })
}
