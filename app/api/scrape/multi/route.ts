// app/api/scrape/multi/route.ts
import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120 // seconds

// ------------ Types ------------
type ModeScope = 'both' | 'practices' | 'clinicians'

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
  // enriched
  specialties?: string[] | null
  languages?: string[] | null
  accepting_new_patients?: boolean | null
  booking_url?: string | null
  education_training?: string[] | null
  source_url?: string | null
  last_seen_at?: string | null
}

type CrawlResult = { practices: Practice[]; clinicians: Clinician[] }

// ------------ Utils ------------
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 CareContactBot/1.0'

const normUrl = (u: string) => {
  if (!u?.trim()) return ''
  return /^https?:\/\//i.test(u) ? u.trim() : `https://${u.trim()}`
}

const slugify = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const abs = (base: string, maybe?: string | null) => {
  if (!maybe) return undefined
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

const cleanTitle = (t?: string | null) =>
  t ? t.replace(/\s+•\s+Community Care Physicians.*$/i, '').trim() : null

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

function upgradeWpThumb(url?: string | null) {
  if (!url) return null
  return url.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp)$)/i, '')
}

function normalizePhoneText(text: string) {
  const digits = (text || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^1?(\d{10})$/, '$1')
}

function pullFirstPhone($: cheerio.CheerioAPI) {
  const tel = $('a[href^="tel:"]').first().attr('href') || ''
  const t1 = normalizePhoneText(tel.replace(/^tel:/, ''))
  if (t1) return t1
  const text = $('body').text().replace(/\s+/g, ' ')
  const m = text.match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)
  return m ? normalizePhoneText(m[0]) : null
}

// ------------ Directory link discovery (robust) ------------
function collectPracticeLinksFromDirectory($: cheerio.CheerioAPI, base: string) {
  const found = new Set<string>()
  const seenHrefs: string[] = []

  // Pass 1: strict – exactly what we expect
  $('a[href]').each((_, a) => {
    const href = ($(a).attr('href') || '').trim()
    if (!href) return
    seenHrefs.push(href)

    let u: URL | null = null
    try {
      u = new URL(href, base)
    } catch {}
    if (!u) return

    const path = u.pathname.replace(/\/+$/, '/')
    const isPracticeDetail = path.startsWith('/practices/') && path !== '/practices/'
    if (isPracticeDetail && /^https?:$/.test(u.protocol)) found.add(u.toString())
  })

  // Pass 2: lenient – any href containing "/practices/"
  if (found.size === 0) {
    $('a[href*="/practices/"]').each((_, a) => {
      const href = ($(a).attr('href') || '').trim()
      let u: URL | null = null
      try {
        u = new URL(href, base)
      } catch {}
      if (u && /^https?:$/.test(u.protocol)) found.add(u.toString())
    })
  }

  // Pass 3: some sites stash URLs in data-* attrs
  if (found.size === 0) {
    $('[data-href*="/practices/"], [data-url*="/practices/"]').each((_, el) => {
      const href = ($(el).attr('data-href') || $(el).attr('data-url') || '').trim()
      let u: URL | null = null
      try {
        u = new URL(href, base)
      } catch {}
      if (u && /^https?:$/.test(u.protocol)) found.add(u.toString())
    })
  }

  // Pass 4: fallback – regex scan of raw HTML
  if (found.size === 0) {
    const html = $.root().html() || ''
    const re = /href\s*=\s*"(.*?)"/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const href = (m[1] || '').trim()
      if (!/\/practices\//.test(href)) continue
      try {
        const u = new URL(href, base)
        if (/^https?:$/.test(u.protocol)) found.add(u.toString())
      } catch {}
    }
  }

  return {
    links: Array.from(found),
    hrefSample: seenHrefs.slice(0, 20),
  }
}

// ------------ Sitemap fallback ------------
async function fetchSitemapPracticeLinks(baseUrl: string): Promise<string[]> {
  const origin = new URL(baseUrl).origin
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/practices-sitemap.xml`,
  ]

  const seen = new Set<string>()

  for (const url of candidates) {
    try {
      const xml = await fetchWithTimeout(url, 10000)
      const locMatches = Array.from(xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))
      for (const m of locMatches) {
        const loc = (m[1] || '').trim()
        if (!loc) continue
        if (/\/practices\/[^\/]+\/?$/i.test(loc)) seen.add(loc)
      }

      // Handle index-of-sitemaps (WordPress / Yoast style)
      const childMaps = Array.from(xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<]+)\s*<\/loc>[\s\S]*?<\/sitemap>/gi))
      for (const cm of childMaps) {
        const childUrl = (cm[1] || '').trim()
        if (!childUrl) continue
        try {
          const childXml = await fetchWithTimeout(childUrl, 10000)
          const childLocs = Array.from(childXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))
          for (const m of childLocs) {
            const loc = (m[1] || '').trim()
            if (/\/practices\/[^\/]+\/?$/i.test(loc)) seen.add(loc)
          }
        } catch {}
      }
    } catch {}
  }

  return Array.from(seen)
}

// ------------ Page parsers ------------
function extractMeta($: cheerio.CheerioAPI, baseUrl: string) {
  const title =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('meta[name="title"]').attr('content') ||
    null

  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null

  const logoCandidates = [
    $('meta[property="og:image"]').attr('content'),
    $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"][sizes="16x16"]').attr('href'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
  ].map((x) => abs(baseUrl, x))
  const logo = logoCandidates.find(Boolean) || null

  // JSON-LD
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
    description,
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
      photo_url: upgradeWpThumb(photo),
      source_url: profile,
      last_seen_at: new Date().toISOString(),
    })
  }

  // Card-like structures
  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''
    const t = ($a.text() || '').trim()
    if (!/doctor|provider|physician|md|np|pa|profile/i.test(href + ' ' + t)) return

    const card = $a.closest('article, .card, .provider, .team-member, li, .grid-item, .wp-block-column')
    const name = (card.find('h3,h4,.name').first().text() || t || '').trim()
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

// enrich one clinician by fetching their profile page
async function enrichClinicianFromProfile(c: Clinician): Promise<Clinician> {
  try {
    const html = await fetchWithTimeout(c.profile_url, 10000)
    const $ = cheerio.load(html)

    // role / credentials
    const credsText =
      $('.credentials,.provider-credentials,.title,.role').first().text().trim() ||
      $('h1 + .subtitle, h1 + .meta').first().text().trim() ||
      c.role ||
      null

    // specialties
    const spec = new Set<string>()
    $('[class*="specialt"], .specialties, .provider-specialties, li').each((_, el) => {
      const t = $(el).text().trim()
      if (/cardiology|pediatrics|family|internal|gastro|ob.?gyn|dermatology|orthopedic|endocrin|geriatr|primary/i.test(t)) {
        spec.add(t.replace(/\s+/g, ' '))
      }
    })

    // languages
    const langs = new Set<string>()
    $('[class*="language"], .languages, .provider-languages').each((_, el) => {
      $(el)
        .text()
        .split(/[•,\/]/)
        .forEach((s) => {
          const t = s.trim()
          if (
            /english|spanish|chinese|mandarin|cantonese|russian|arabic|french|hindi|italian|portuguese|korean|vietnamese/i.test(
              t
            )
          ) {
            langs.add(t)
          }
        })
    })

    // accepting new patients
    const accepting = /accepting\s+new\s+patients/i.test($('body').text())

    // booking link
    let booking: string | null = null
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const txt = $(a).text()
      if (/book|schedule|appointment|request/i.test(href + ' ' + txt)) {
        try {
          booking = new URL(href, c.profile_url).toString()
        } catch {}
      }
    })

    // education / training / boards
    const edu: string[] = []
    $('h2,h3').each((_, h) => {
      const head = $(h).text().toLowerCase()
      if (/education|training|residenc|fellowship|board/.test(head)) {
        $(h)
          .nextUntil('h2,h3')
          .find('li,p')
          .each((__, el) => {
            const t = $(el).text().trim()
            if (t && t.length < 500) edu.push(t)
          })
      }
    })

    return {
      ...c,
      role: credsText,
      photo_url: upgradeWpThumb(c.photo_url),
      specialties: Array.from(spec),
      languages: Array.from(langs),
      accepting_new_patients: accepting,
      booking_url: booking,
      education_training: edu.slice(0, 20),
      source_url: c.profile_url,
      last_seen_at: new Date().toISOString(),
    }
  } catch {
    return {
      ...c,
      photo_url: upgradeWpThumb(c.photo_url),
      source_url: c.profile_url,
      last_seen_at: new Date().toISOString(),
    }
  }
}

function extractPractice(practiceUrl: string, $: cheerio.CheerioAPI): Practice {
  const meta = extractMeta($, practiceUrl)
  const slug =
    slugify(new URL(practiceUrl).pathname.split('/').filter(Boolean).slice(-1)[0] || meta.title || practiceUrl)

  const name = cleanTitle(meta.title) || null
  const phone = meta.phone || pullFirstPhone($)
  const { address, city, state, zip } = addressFromLD(meta.addressBlock)

  return {
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
}

// ------------ Parser for each practice page ------------
async function parsePracticePage(practiceUrl: string) {
  const html = await fetchWithTimeout(practiceUrl)
  const $ = cheerio.load(html)
  const practice = extractPractice(practiceUrl, $)
  const cliniciansRaw = extractCliniciansFromPractice($, practiceUrl, practice.slug)
  const clinicians = await Promise.all(cliniciansRaw.map(enrichClinicianFromProfile))
  return { practice, clinicians }
}

// ------------ Handler ------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const baseUrl = normUrl(searchParams.get('url') || '')
  const maxPages = Math.max(1, Math.min(100, Number(searchParams.get('maxPages') || 25)))
  const insert = (searchParams.get('insert') || 'false').toLowerCase() === 'true'
  const scope: ModeScope = (searchParams.get('scope') as ModeScope) || 'both'
  const debug = (searchParams.get('debug') || '') === '1'

  if (!baseUrl) return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 })

  // if writing, require admin token
  if (insert) {
    const token = req.headers.get('x-admin-token') || ''
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expected || token !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // collect practice links from directory page
    const dirHtml = await fetchWithTimeout(baseUrl)
    const $dir = cheerio.load(dirHtml)
    const discovered = collectPracticeLinksFromDirectory($dir, baseUrl)

    let practiceLinks = discovered.links
    // fallback to sitemap if nothing found
    let usedSitemap = false
    if (practiceLinks.length === 0) {
      const sitemapLinks = await fetchSitemapPracticeLinks(baseUrl)
      if (sitemapLinks.length) {
        usedSitemap = true
        practiceLinks = sitemapLinks
      }
    }

    // limit and sort for stability
    practiceLinks = Array.from(new Set(practiceLinks)).slice(0, maxPages).sort()

    const results: CrawlResult = { practices: [], clinicians: [] }

    for (const link of practiceLinks) {
      const pth = new URL(link).pathname.replace(/\/+$/, '/')
      if (pth === '/practices/') continue

      const { practice, clinicians } = await parsePracticePage(link)
      if (scope !== 'clinicians') results.practices.push(practice)
      if (scope !== 'practices') results.clinicians.push(...clinicians)
    }

    // de-dupe
    results.practices = uniqueBy(results.practices, (p) => p.slug)
    results.clinicians = uniqueBy(results.clinicians, (c) => `${c.practice_slug}::${c.slug}`)

    // ---------- Non-destructive upserts ----------
    if (insert) {
      const supa = adminClient()

      // practices
      if (scope !== 'clinicians' && results.practices.length) {
        const slugs = results.practices.map((p) => p.slug)
        const { data: existing } = await supa.from('providers').select('*').in('slug', slugs)

        const merged = results.practices.map((p) => {
          const old = existing?.find((e: any) => e.slug === p.slug) || {}
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

        const { error: upErr } = await supa.from('providers').upsert(merged, { onConflict: 'slug' })
        if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
      }

      // clinicians
      if (scope !== 'practices' && results.clinicians.length) {
        const keys = results.clinicians.map((c) => [c.practice_slug, c.slug])
        // fetch existing rows to merge
        const { data: existingC } = await supa
          .from('clinicians')
          .select('*')
          .in('practice_slug', keys.map((k) => k[0]))

        const mergedC = results.clinicians.map((c) => {
          const old =
            existingC?.find((e: any) => e.practice_slug === c.practice_slug && e.slug === c.slug) || {}
          return {
            practice_slug: c.practice_slug,
            slug: c.slug,
            name: c.name ?? old.name ?? null,
            role: c.role ?? old.role ?? null,
            profile_url: c.profile_url ?? old.profile_url ?? null,
            photo_url: c.photo_url ?? old.photo_url ?? null,
            specialties: c.specialties ?? old.specialties ?? null,
            languages: c.languages ?? old.languages ?? null,
            accepting_new_patients:
              c.accepting_new_patients ?? old.accepting_new_patients ?? null,
            booking_url: c.booking_url ?? old.booking_url ?? null,
            education_training: c.education_training ?? old.education_training ?? null,
            source_url: c.source_url ?? old.source_url ?? null,
            last_seen_at: c.last_seen_at ?? old.last_seen_at ?? new Date().toISOString(),
          }
        })

        const { error: upErr2 } = await supa
          .from('clinicians')
          .upsert(mergedC, { onConflict: 'practice_slug,slug' })
        if (upErr2) return NextResponse.json({ ok: false, error: upErr2.message }, { status: 500 })
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
        ...(debug
          ? {
              debug: {
                usedSitemap,
                linkCount: practiceLinks.length,
                foundLinksSample: practiceLinks.slice(0, 10),
                hrefSample: discovered.hrefSample,
              },
            }
          : {}),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Scrape failed' }, { status: 500 })
  }
}
