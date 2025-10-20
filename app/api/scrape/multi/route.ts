// app/api/scrape/multi/route.ts
import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60 // seconds

// ----------------------- Types -----------------------
type Scope = 'both' | 'practices' | 'clinicians'

type Practice = {
  slug: string
  name: string | null
  website: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  logo_url?: string | null
  description?: string | null
  source?: 'crawl' | 'single'
}

type Clinician = {
  practice_slug: string
  slug: string
  name: string
  role?: string | null
  profile_url: string
  photo_url?: string | null
}

type CrawlResult = {
  practices: Practice[]
  clinicians: Clinician[]
}

// ----------------------- Utils -----------------------
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 CareContactBot/1.0'

function normUrl(u: string): string {
  if (!u?.trim()) return ''
  const s = u.trim()
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

function slugify(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function abs(base: string, maybe?: string | null) {
  if (!maybe) return undefined
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

function cleanTitle(t?: string | null) {
  if (!t) return null
  // trim long suffixes like " • Community Care Physicians …"
  return t.replace(/\s+•\s+Community Care Physicians.*$/i, '').trim()
}

async function fetchWithTimeout(url: string, timeout = 12000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(id)
  }
}

function uniqueBy<T>(arr: T[], keyFn: (t: T) => string) {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of arr) {
    const k = keyFn(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

// ----------------- Directory link discovery -----------------
function collectPracticeLinksFromDirectory($: cheerio.CheerioAPI, base: string): string[] {
  const out = new Set<string>()
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || ''
    let u: URL | null = null
    try {
      u = new URL(href, base)
    } catch {}
    if (!u) return
    const path = u.pathname.replace(/\/+$/, '/')
    const isPracticeDetail = path.startsWith('/practices/') && path !== '/practices/'
    if (!isPracticeDetail) return
    if (u.hash) return
    if (!/^https?:$/.test(u.protocol)) return
    out.add(u.toString())
  })
  return Array.from(out)
}

// ----------------- Page parsers -----------------
function extractMeta($: cheerio.CheerioAPI, baseUrl: string) {
  const title =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('meta[name="title"]').attr('content') ||
    null

  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null

  // Prioritize strong hero/logo candidates
  const logoCandidates = [
    $('meta[property="og:image"]').attr('content'),
    $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"][sizes="16x16"]').attr('href'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
  ].map((x) => abs(baseUrl, x))
  const logo = logoCandidates.find(Boolean) || null

  // JSON-LD address / telephone / image
  let jsonldAddr: any = null
  let jsonldPhone: string | null = null
  let jsonldImage: string | null = null

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text().trim()
      const j = JSON.parse(raw)
      const entities = Array.isArray(j) ? j : [j]
      for (const e of entities) {
        const addr = e.address || e.location?.address
        if (addr && !jsonldAddr) jsonldAddr = addr
        if (e.telephone && !jsonldPhone) {
          const p = String(e.telephone).replace(/\D/g, '')
          jsonldPhone = p ? p.replace(/^1?(\d{10})$/, '$1') : null
        }
        if ((e.logo || e.image) && !jsonldImage) {
          const i = Array.isArray(e.image) ? e.image[0] : e.image
          jsonldImage = abs(baseUrl, e.logo || i) || null
        }
      }
    } catch {}
  })

  return {
    title: cleanTitle(title),
    description: desc,
    logo: jsonldImage || logo,
    addressBlock: jsonldAddr,
    phone: jsonldPhone,
  }
}

function addressFromLD(addr: any) {
  if (!addr) return {} as { address?: string; city?: string; state?: string; zip?: string }
  const address = [addr.streetAddress, addr.addressLine2].filter(Boolean).join(' ').trim() || undefined
  const city = addr.addressLocality || undefined
  const state = addr.addressRegion || undefined
  const zip = addr.postalCode || undefined
  return { address, city, state, zip }
}

function extractCliniciansFromPractice(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  practiceSlug: string
): Clinician[] {
  const people: Clinician[] = []

  const pushPerson = (name: string, href: string, photo?: string | null, role?: string | null) => {
    name = (name || '').trim().replace(/\s{2,}/g, ' ')
    if (!name || /find a doctor/i.test(name)) return
    let profile = ''
    try {
      profile = new URL(href, baseUrl).toString()
    } catch {}
    if (!profile) return

    let slug = ''
    try {
      const u = new URL(profile)
      const parts = u.pathname.split('/').filter(Boolean)
      slug = (parts[parts.length - 1] || name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    } catch {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    }

    people.push({
      practice_slug: practiceSlug,
      slug,
      name,
      role: role || null,
      profile_url: profile,
      photo_url: photo || null,
    })
  }

  // Card-like structures
  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''
    const t = ($a.text() || '').trim()
    if (!/doctor|provider|physician|md|np|pa|profile/i.test(href + ' ' + t)) return

    const card = $a.closest('article, .card, .provider, .team-member, li, .grid-item, .wp-block-column')
    const name =
      (card.find('h3,h4,.name').first().text() || t || '').trim()
    const role =
      (card.find('.role,.title,.specialty,.credentials').first().text() || '').trim() || null

    let photo: string | null = null
    const img = card.find('img').first()
    if (img.length) {
      const src = img.attr('data-src') || img.attr('src') || ''
      if (src) {
        try {
          photo = new URL(src, baseUrl).toString()
        } catch {}
      }
    }

    pushPerson(name, href, photo, role)
  })

  // Headings-based sections
  $('h2,h3').each((_, h) => {
    const txt = $(h).text().trim().toLowerCase()
    if (!/doctor|provider|advanced practice|team/.test(txt)) return
    const block = $(h).nextUntil('h2,h3')
    block.find('a[href]').each((__, a) => {
      const $a = $(a)
      const href = $a.attr('href') || ''
      const text = $a.text().trim()
      if (!text || /find a doctor/i.test(text)) return

      let photo: string | null = null
      const img = $a.find('img').first().length
        ? $a.find('img').first()
        : $a.closest('li,article,.card,.team-member').find('img').first()
      if (img.length) {
        const src = img.attr('data-src') || img.attr('src') || ''
        if (src) {
          try {
            photo = new URL(src, baseUrl).toString()
          } catch {}
        }
      }
      pushPerson(text, href, photo, null)
    })
  })

  return uniqueBy(people, (p) => `${p.practice_slug}::${p.slug}`)
}

function normalizePhoneText(text: string) {
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^1?(\d{10})$/, '$1')
}

function pullFirstPhone($: cheerio.CheerioAPI) {
  // tel: links first
  const tel = $('a[href^="tel:"]').first().attr('href') || ''
  const t1 = normalizePhoneText(tel.replace(/^tel:/, ''))
  if (t1) return t1

  // text pattern fallback
  const text = $('body').text().replace(/\s+/g, ' ')
  const m = text.match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)
  return m ? normalizePhoneText(m[0]) : null
}

async function parsePracticePage(practiceUrl: string): Promise<{ practice: Practice; clinicians: Clinician[] }> {
  const html = await fetchWithTimeout(practiceUrl)
  const $ = cheerio.load(html)
  const meta = extractMeta($, practiceUrl)
  const slug = slugify(new URL(practiceUrl).pathname.split('/').filter(Boolean).slice(-1)[0] || meta.title || practiceUrl)

  const name = cleanTitle(meta.title) || null
  const phone = meta.phone || pullFirstPhone($)
  const { address, city, state, zip } = addressFromLD(meta.addressBlock)

  const practice: Practice = {
    slug,
    name,
    website: practiceUrl,
    phone: phone || null,
    email: null,
    address: address || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    logo_url: meta.logo || null,
    description: meta.description || null,
    source: 'crawl',
  }

  const clinicians = extractCliniciansFromPractice($, practiceUrl, slug)
  return { practice, clinicians }
}

// ----------------- Main handler -----------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const baseUrl = normUrl(searchParams.get('url') || '')
  const maxPages = Math.max(1, Math.min(100, Number(searchParams.get('maxPages') || 25)))
  const maxDepth = Math.max(1, Math.min(5, Number(searchParams.get('maxDepth') || 2)))
  const insert = (searchParams.get('insert') || 'false').toLowerCase() === 'true'
  const scope: Scope = (searchParams.get('scope') as Scope) || 'both'

  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 })
  }

  // If inserting, require token
  if (insert) {
    const token = req.headers.get('x-admin-token') || ''
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expected || token !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // directory crawl
    const startHtml = await fetchWithTimeout(baseUrl)
    const $start = cheerio.load(startHtml)
    const practiceLinks = collectPracticeLinksFromDirectory($start, baseUrl).slice(0, maxPages)

    const results: CrawlResult = { practices: [], clinicians: [] }

    // crawl each practice detail page
    for (const link of practiceLinks) {
      // skip directory root if it leaks in
      const pth = new URL(link).pathname.replace(/\/+$/, '/')
      if (pth === '/practices/') continue

      const { practice, clinicians } = await parsePracticePage(link)
      if (scope !== 'clinicians') results.practices.push(practice)
      if (scope !== 'practices') results.clinicians.push(...clinicians)
    }

    // de-dup
    results.practices = uniqueBy(results.practices, (p) => p.slug)
    results.clinicians = uniqueBy(results.clinicians, (c) => `${c.practice_slug}::${c.slug}`)

    // Insert / upsert if requested
    if (insert) {
      const supa = adminClient()

      if (scope !== 'clinicians' && results.practices.length) {
        // Read existing to merge non-null fields safely
        const slugs = results.practices.map((p) => p.slug)
        const { data: existing } = await supa.from('providers').select('*').in('slug', slugs)

        const safeMerged = results.practices.map((p) => {
          const old = existing?.find((e: any) => e.slug === p.slug) || {}
          // prefer NEW non-null over old; never overwrite with null
          return {
            slug: p.slug,
            name: p.name ?? old.name ?? null,
            website: p.website ?? old.website ?? null,
            phone: p.phone ?? old.phone ?? null,
            email: p.email ?? old.email ?? null,
            address: p.address ?? old.address ?? null,
            city: p.city ?? old.city ?? null,
            state: p.state ?? old.state ?? null,
            zip: p.zip ?? old.zip ?? null,
            logo_url: p.logo_url ?? old.logo_url ?? null,
            description: p.description ?? old.description ?? null,
          }
        })

        const { error: upErr } = await supa
          .from('providers')
          .upsert(safeMerged, { onConflict: 'slug' })
        if (upErr) {
          return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
        }
      }

      if (scope !== 'practices' && results.clinicians.length) {
        const { error: upErr2 } = await adminClient()
          .from('clinicians')
          .upsert(results.clinicians, { onConflict: 'practice_slug,slug' })
        if (upErr2) {
          return NextResponse.json({ ok: false, error: upErr2.message }, { status: 500 })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: results,
      meta: {
        mode: 'multi',
        scope,
        counts: {
          practices: results.practices.length,
          clinicians: results.clinicians.length,
        },
        timestamp: new Date().toISOString(),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Scrape failed' }, { status: 500 })
  }
}
