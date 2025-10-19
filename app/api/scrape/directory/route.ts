// app/api/scrape/directory/route.ts
import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 30

type ProviderOut = {
  slug?: string
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

/* -------------------------- utils -------------------------- */
function norm(u: string) { return /^https?:\/\//i.test(u) ? u : `https://${u}` }
function abs(base: string, href?: string | null) {
  if (!href) return
  try { return new URL(href, base).toString() } catch { return }
}
async function get(url: string) {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`GET ${r.status}`)
  return r.text()
}
function segSlugFromUrl(url: string) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1]?.toLowerCase() || u.hostname.replace(/^www\./, '')
  } catch { return undefined }
}
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/* -------- detail-page scraper (no AI; tolerant) -------- */
async function scrapeDetail(url: string): Promise<ProviderOut> {
  const html = await get(url)
  const $ = cheerio.load(html)

  const title =
    $('meta[property="og:title"]').attr('content')?.trim()
    || $('h1').first().text().trim()
    || $('title').first().text().trim()
    || new URL(url).hostname.replace(/^www\./, '')

  const description =
    $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || null

  const logo =
    $('meta[property="og:logo"]').attr('content')
    || $('link[rel="apple-touch-icon"][sizes]').attr('href')
    || $('link[rel="apple-touch-icon"]').attr('href')
    || $('link[rel="icon"][sizes]').attr('href')
    || $('link[rel="icon"]').attr('href')
    || '/favicon.ico'

  const phone =
    $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/, '').trim()
    || ($('body').text().match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)?.[0] ?? null)

  const email =
    $('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/, '').trim()
    || (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null)

  let address: string | null = null, city: string | null = null, state: string | null = null, zip: string | null = null
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text())
      const nodes = Array.isArray(j) ? j : [j]
      for (const n of nodes) {
        const a = n?.address || n?.location?.address
        if (a) {
          address = address || [a.streetAddress, a.address2].filter(Boolean).join(' ').trim() || null
          city = city || a.addressLocality || null
          state = state || a.addressRegion || null
          zip = zip || a.postalCode || null
        }
      }
    } catch {}
  })

  if (!address) {
    const txt = $('address').first().text().trim()
      || $('[class*="address"], [id*="address"]').first().text().trim()
    if (txt) {
      const t = txt.replace(/\s+/g, ' ')
      const m = t.match(/(.+?)\s+([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/)
      if (m) { address = m[1].trim(); city = m[2].trim(); state = m[3].trim(); zip = m[4].trim() }
      else { address = t }
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

/* -------- collect only /practices/<slug>/ links (handles absolute URLs) -------- */
function extractPracticeLinksStrict(dirUrl: string, $: cheerio.CheerioAPI) {
  const out = new Set<string>()
  $('a[href]').each((_, a) => {
    const raw = ($(a).attr('href') || '').trim()
    const absUrl = abs(dirUrl, raw)
    if (!absUrl) return
    try {
      const path = new URL(absUrl).pathname
      if (/^\/practices\/[a-z0-9-]+\/?$/i.test(path)) out.add(absUrl)
    } catch {}
  })
  return Array.from(out)
}

/* -------- accept only pages that look like real practices -------- */
function isPracticeDetail(url: string, $: cheerio.CheerioAPI, htmlLower: string) {
  const pathOK = /\/practices\/[a-z0-9-]+\/?$/i.test(new URL(url).pathname)

  const hasTel = !!$('a[href^="tel:"]').first().attr('href')
  const hasAddressTag = $('address').text().trim().length > 0
  const hasAddressBlock = /address|suite|ste\.|st\.|ave\.|road|rd\.|blvd|zip|postal/i
    .test( ($('[class*="address"],[id*="address"]').first().text() || '').trim() )

  let hasJsonLdAddress = false
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text())
      const nodes = Array.isArray(j) ? j : [j]
      for (const n of nodes) {
        if (n?.address || n?.location?.address) { hasJsonLdAddress = true; break }
      }
    } catch {}
  })

  const strong = hasTel || hasAddressTag || hasAddressBlock || hasJsonLdAddress
  return pathOK && strong
}

/* -------------------------- GET -------------------------- */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = norm(searchParams.get('url') || '')
  const insert = (searchParams.get('insert') || 'false').toLowerCase() === 'true'
  const token = req.headers.get('x-admin-token') || ''
  const maxPages = Math.max(1, Math.min(100, parseInt(searchParams.get('maxPages') || '50', 10)))

  if (!url) return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 })

  const html = await get(url)
  const $ = cheerio.load(html)

  // strictly collect detail links (supports absolute or relative hrefs)
  let links = extractPracticeLinksStrict(url, $)

  // fallback if directory is exactly /practices/
  if (links.length === 0 && /\/practices\/?$/i.test(url)) {
    $('a[href]').each((_, a) => {
      const raw = ($(a).attr('href') || '').trim()
      const absUrl = abs(url, raw)
      if (!absUrl) return
      try {
        const path = new URL(absUrl).pathname
        if (/^\/practices\/[a-z0-9-]+\/?$/i.test(path)) links.push(absUrl)
      } catch {}
    })
  }

  links = Array.from(new Set(links)).slice(0, maxPages)

  // scrape + validate + de-dupe by slug
  const bySlug = new Map<string, ProviderOut>()
  for (const u of links) {
    try {
      const detailHtml = await get(u)
      const $$ = cheerio.load(detailHtml)
      if (!isPracticeDetail(u, $$, detailHtml.toLowerCase())) continue
      const p = await scrapeDetail(u)
      if (!p.slug) continue
      const key = p.slug.toLowerCase()
      if (!bySlug.has(key)) bySlug.set(key, { ...p, slug: key })
    } catch {}
  }

  const providers = Array.from(bySlug.values())

  // optional save (upsert by slug)
  if (insert && providers.length) {
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expected || token !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const supa = adminClient()
    const { error } = await supa.from('providers')
      .upsert(providers, { onConflict: 'slug', ignoreDuplicates: false })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    data: providers,
    meta: { mode: 'directory', count: providers.length, timestamp: new Date().toISOString() }
  })
}
