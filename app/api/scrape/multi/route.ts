import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

type ScrapeMode = 'single' | 'directory' | 'pagination'
type ScrapeSelector = 'both' | 'practices' | 'clinicians'

type Practice = {
  slug: string
  name?: string | null
  website: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  services?: string | null
  logo_url?: string | null
  description?: string | null
  source?: string | null
}

type Clinician = {
  practice_slug: string
  slug: string
  name?: string | null
  title?: string | null
  photo_url?: string | null
  profile_url?: string | null
  npi?: string | null
  specialty?: string | null
  phone?: string | null
  email?: string | null
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const sameHost = (a: string, b: string) => {
  try {
    return new URL(a).host === new URL(b).host
  } catch {
    return false
  }
}

const abs = (base: string, href?: string | null) => {
  if (!href) return undefined
  try {
    return new URL(href, base).toString()
  } catch {
    return undefined
  }
}

const norm = (u: string) =>
  /^https?:\/\//i.test(u) ? u : `https://${u}`

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const pickMerge = <T extends Record<string, any>>(
  prev: T | null,
  next: Partial<T>
): T => {
  const out: any = { ...(prev ?? {}) }
  Object.entries(next).forEach(([k, v]) => {
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      out[k] = v
    }
  })
  return out
}

async function fetchHTML(url: string, timeout = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA },
      redirect: 'follow',
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } finally {
    clearTimeout(t)
  }
}

/** very light metadata extractor for titles, description, logos */
function extractMeta($: cheerio.CheerioAPI, base: string) {
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text().trim() ||
    undefined

  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    undefined

  const logoCandidates = [
    $('meta[property="og:logo"]').attr('content'),
    $('meta[property="og:image"]').attr('content'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="icon"][sizes="192x192"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
    $('img[alt*="logo" i]').attr('src'),
    '/favicon.ico',
  ]
  const logo =
    logoCandidates
      .map((h) => abs(base, h))
      .find((x) => !!x) || undefined

  return { title, desc, logo }
}

function extractPhones($: cheerio.CheerioAPI) {
  const set = new Set<string>()
  $('a[href^="tel:"]').each((_, a) => {
    const n = ($(a).attr('href') || '').replace(/^tel:/, '')
    const clean = n.replace(/\D/g, '')
    if (clean.length >= 10) set.add(clean)
  })
  const txt = $('body').text().replace(/\s+/g, ' ')
  ;[
    /(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/g,
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ].forEach((re) => {
    txt.match(re)?.forEach((m) => {
      const clean = m.replace(/\D/g, '')
      if (clean.length >= 10) set.add(clean)
    })
  })
  return Array.from(set)
}

function extractJSONLD($: cheerio.CheerioAPI) {
  const out: Partial<Practice> = {}
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text())
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const a = item.address || item.location?.address
        if (a) {
          const addr =
            [a.streetAddress, a.addressLine2].filter(Boolean).join(' ') ||
            undefined
          if (addr) out.address = addr
          if (a.addressLocality) out.city = a.addressLocality
          if (a.addressRegion) out.state = a.addressRegion
          if (a.postalCode) out.zip = a.postalCode
        }
        if (item.telephone && !out.phone) {
          const clean = String(item.telephone).replace(/\D/g, '')
          if (clean.length >= 10) out.phone = clean
        }
        if (item.email && !out.email) {
          out.email = String(item.email).toLowerCase()
        }
        if (item.name && !out.name) out.name = String(item.name)
        if (item.description && !out.description)
          out.description = String(item.description)
      }
    } catch {}
  })
  return out
}

/** Extract clinicians from a typical practice page */
function extractClinicians(
  $: cheerio.CheerioAPI,
  practiceSlug: string,
  base: string
): Clinician[] {
  const people: Clinician[] = []

  const cardSelectors = [
    // general patterns
    '[class*="doctor"]',
    '[class*="provider"]',
    '[class*="physician"]',
    '[class*="team"] .card',
    '.card-provider',
    // communitycare.com specifics (loose)
    '.providers .card',
    '.people .card',
  ]

  const used = new Set<string>()

  $(cardSelectors.join(',')).each((_, el) => {
    const $el = $(el)

    // name
    const name =
      $el.find('h3, h4, .name, .card-title, a').first().text().trim() ||
      $el.text().split('\n').map((s) => s.trim()).filter(Boolean)[0] ||
      ''

    if (!name || name.length < 2) return

    const slug = slugify(name)
    if (used.has(slug)) return
    used.add(slug)

    const title =
      $el.find('.title, .degree, .credentials, small').first().text().trim() ||
      undefined

    const profileHref =
      $el.find('a[href]').first().attr('href') ||
      undefined
    const profile_url = abs(base, profileHref)

    const imgSrc =
      $el.find('img').attr('src') ||
      $el.find('img').attr('data-src') ||
      undefined
    const photo_url = abs(base, imgSrc)

    people.push({
      practice_slug: practiceSlug,
      slug,
      name,
      title,
      profile_url,
      photo_url,
    })
  })

  // fallback: sometimes clinicians are just links under headings
  if (!people.length) {
    $('h2,h3:contains("Doctor"),h2,h3:contains("Provider")')
      .nextUntil('h2,h3')
      .find('a[href]')
      .each((_, a) => {
        const name = $(a).text().trim()
        if (!name) return
        const slug = slugify(name)
        if (used.has(slug)) return
        used.add(slug)
        people.push({
          practice_slug: practiceSlug,
          slug,
          name,
          profile_url: abs(base, $(a).attr('href')),
        })
      })
  }

  return people
}

/** Extract a single practice page */
function parsePractice(html: string, url: string): { practice: Practice; clinicians: Clinician[] } {
  const $ = cheerio.load(html)
  const { title, desc, logo } = extractMeta($, url)
  const j = extractJSONLD($)
  const phones = extractPhones($)

  // practice slug: prefer last path segment when under /practices/
  let slug = ''
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1]
    slug = last && u.pathname.includes('/practices/') ? slugify(last) : slugify(title || j.name || u.hostname)
  } catch {
    slug = slugify(title || j.name || url)
  }

  const practice: Practice = {
    slug,
    name: j.name || title || null,
    website: url,
    phone: j.phone || phones[0] || null,
    email: j.email || null,
    address: j.address || null,
    city: j.city || null,
    state: j.state || null,
    zip: j.zip || null,
    services: undefined,
    logo_url: logo || null,
    description: j.description || desc || null,
    source: 'crawl',
  }

  const clinicians = extractClinicians($, slug, url)
  return { practice, clinicians }
}

/** Discover practice detail links from listing/pagination pages */
function discoverPracticeLinks($: cheerio.CheerioAPI, base: string): string[] {
  const out = new Set<string>()
  // Any anchor that clearly points to a practice detail
  $('a[href*="/practices/"]').each((_, a) => {
    const u = abs(base, $(a).attr('href'))
    if (u && sameHost(u, base)) out.add(u)
  })
  // Fallback: card links under obvious containers
  $('.card a[href], .practice a[href]').each((_, a) => {
    const u = abs(base, $(a).attr('href'))
    if (u && sameHost(u, base) && /\/practices\//i.test(u)) out.add(u)
  })
  return Array.from(out)
}

/** find pagination/next links on listing pages */
function discoverNextPages($: cheerio.CheerioAPI, base: string): string[] {
  const next = new Set<string>()
  $('a[rel="next"], a:contains("Next"), a:contains("›"), a:contains("»")').each((_, a) => {
    const u = abs(base, $(a).attr('href'))
    if (u && sameHost(u, base)) next.add(u)
  })
  return Array.from(next)
}

export async function GET(req: Request) {
  const url1 = new URL(req.url)
  const website = url1.searchParams.get('url')
  const mode = (url1.searchParams.get('mode') as ScrapeMode) || 'directory'
  const maxPages = Number(url1.searchParams.get('maxPages') || '10')
  const maxDepth = Number(url1.searchParams.get('maxDepth') || '2')
  const insert = (url1.searchParams.get('insert') || '').toLowerCase() === 'true'
  const scrapeSelect = (url1.searchParams.get('scrape') as ScrapeSelector) || 'both' // both|practices|clinicians
  const token = req.headers.get('x-admin-token') || ''

  if (!website) {
    return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 })
  }

  const startURL = norm(website)

  try {
    // BFS crawl
    const seen = new Set<string>()
    const practicePages = new Set<string>()

    const q: Array<{ url: string; depth: number }> = [{ url: startURL, depth: 0 }]

    while (q.length && practicePages.size < 500) {
      const { url, depth } = q.shift()!
      if (seen.has(url)) continue
      seen.add(url)
      const html = await fetchHTML(url)
      const $ = cheerio.load(html)

      // Is it a practice detail?
      if (/\/practices\//i.test(url)) {
        practicePages.add(url)
      }

      // Directory discovery
      if (depth < maxDepth && (mode === 'directory' || mode === 'pagination')) {
        discoverPracticeLinks($, url).forEach((u) => practicePages.add(u))
        if (mode === 'pagination') {
          discoverNextPages($, url).forEach((u) => {
            if (!seen.has(u) && q.length < maxPages) q.push({ url: u, depth: depth + 1 })
          })
        }
      }

      // stop if too many pages
      if (seen.size >= maxPages) break
    }

    // If single mode or the URL itself is a practice page
    if (mode === 'single' || /\/practices\//i.test(startURL)) {
      practicePages.add(startURL)
    }

    const practices: Practice[] = []
    const clinicians: Clinician[] = []

    for (const purl of Array.from(practicePages)) {
      const html = await fetchHTML(purl)
      const { practice, clinicians: ppl } = parsePractice(html, purl)

      if (scrapeSelect === 'both' || scrapeSelect === 'practices') {
        practices.push(practice)
      }
      if (scrapeSelect === 'both' || scrapeSelect === 'clinicians') {
        clinicians.push(...ppl)
      }
      if (practices.length + clinicians.length > 2000) break
    }

    if (!insert) {
      return NextResponse.json({
        ok: true,
        data: { practices, clinicians },
        meta: {
          practices: practices.length,
          clinicians: clinicians.length,
          mode,
          scrape: scrapeSelect,
          timestamp: new Date().toISOString(),
        },
      })
    }

    // -- INSERT / UPSERT (merge non-empty fields only) --
    const supa = adminClient()
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expected || token !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Upsert practices
    if (scrapeSelect === 'both' || scrapeSelect === 'practices') {
      for (const p of practices) {
        // fetch existing to avoid overwriting with nulls
        const { data: ex } = await supa.from('providers').select('*').eq('slug', p.slug).maybeSingle()
        const payload = pickMerge(ex, {
          ...p,
          updated_at: new Date().toISOString(),
        })
        await supa.from('providers').upsert(payload, { onConflict: 'slug' })
      }
    }

    // Upsert clinicians
    if (scrapeSelect === 'both' || scrapeSelect === 'clinicians') {
      for (const c of clinicians) {
        const { data: ex } = await supa
          .from('clinicians')
          .select('*')
          .eq('practice_slug', c.practice_slug)
          .eq('slug', c.slug)
          .maybeSingle()
        const payload = pickMerge(ex, {
          ...c,
          updated_at: new Date().toISOString(),
        })
        await supa.from('clinicians').upsert(payload, { onConflict: 'practice_slug,slug' })
      }
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      meta: {
        practices: (scrapeSelect === 'clinicians') ? 0 : practices.length,
        clinicians: (scrapeSelect === 'practices') ? 0 : clinicians.length,
        mode,
        scrape: scrapeSelect,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'scrape failed' },
      { status: 500 }
    )
  }
}
