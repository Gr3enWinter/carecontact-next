import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 30 // seconds

// ============ TYPES & INTERFACES ============
interface ScrapeOut {
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
  social_links?: string[] | null
  hours?: string | null
  confidence_score?: number
}

interface ScrapeResult {
  url: string
  title?: string
  description?: string | null
  logo?: string | null
  phones: string[]
  emails: string[]
  addr: Partial<ScrapeOut>
  htmlLower: string
  socialLinks?: string[]
  hours?: string | null  // Fixed: changed from undefined to null
}

// ============ CONFIG & CONSTANTS ============
const SCRAPE_CONFIG = {
  timeout: 10000,
  maxPages: 3,
  maxRedirects: 5,
  userAgent: 'Mozilla/5.0 (compatible; BusinessScraper/1.0; +https://github.com/your-repo)'
} as const

const SERVICE_KEYWORDS = [
  'home care', 'home health', 'assisted living', 'memory care', 'dementia care',
  'skilled nursing', 'rehab', 'respite', 'hospice', 'caregiver', 'companionship',
  'elder care', 'senior care', 'nursing home', 'retirement home'
] as const

const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com',
  'youtube.com', 'tiktok.com', 'pinterest.com'
] as const

// ============ UTILITY FUNCTIONS ============
const normUrl = (url: string): string => {
  if (!url?.trim()) return ''
  const cleanUrl = url.trim().toLowerCase()
  return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`
}

const abs = (base: string, maybe?: string | null): string | undefined => {
  if (!maybe) return undefined
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

const pick = <T extends object>(obj: T, keys: (keyof T)[]): Partial<T> => {
  const out: Partial<T> = {}
  keys.forEach(k => { 
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k] 
  })
  return out
}

const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1')
}

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ============ CORE SCRAPING FUNCTIONS ============
async function fetchWithTimeout(url: string, timeout: number = SCRAPE_CONFIG.timeout) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': SCRAPE_CONFIG.userAgent,
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractPhones($: cheerio.CheerioAPI): string[] {
  const phoneSet = new Set<string>()
  
  // Extract from tel: links
  $('a[href^="tel:"]').each((_, element) => {
    const href = $(element).attr('href') || ''
    const phone = href.replace(/^tel:/, '').trim()
    if (phone) phoneSet.add(normalizePhone(phone))
  })

  // Extract from text content with multiple patterns
  const text = $('body').text().replace(/\s+/g, ' ')
  const phonePatterns = [
    /(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/g, // US format
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g, // Simple format
  ]

  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern)
    matches?.forEach(phone => phoneSet.add(normalizePhone(phone)))
  })

  return Array.from(phoneSet).slice(0, 5) // Limit results
}

function extractEmails(html: string): string[] {
  const emailSet = new Set<string>()
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const matches = html.match(emailRegex)
  
  matches?.forEach(email => {
    if (isValidEmail(email)) {
      emailSet.add(email.toLowerCase())
    }
  })

  return Array.from(emailSet).slice(0, 5) // Limit results
}

function extractJsonLdData($: cheerio.CheerioAPI): Partial<ScrapeOut> {
  const result: Partial<ScrapeOut> = {}
  
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const rawText = $(element).contents().text().trim()
      const jsonData = JSON.parse(rawText)
      const entities = Array.isArray(jsonData) ? jsonData : [jsonData]

      for (const entity of entities) {
        // Handle different LD+JSON structures
        const address = entity.address || entity.location?.address
        if (address) {
          result.address = [address.streetAddress, address.addressLine2]
            .filter(Boolean).join(' ').trim() || result.address
          result.city = address.addressLocality || result.city
          result.state = address.addressRegion || result.state
          result.zip = address.postalCode || result.zip
        }

        // Extract contact info
        if (!result.phone && entity.telephone) {
          result.phone = normalizePhone(String(entity.telephone))
        }
        if (!result.email && entity.email && isValidEmail(entity.email)) {
          result.email = String(entity.email).toLowerCase()
        }

        // Extract hours
        if (!result.hours && entity.openingHours) {
          result.hours = Array.isArray(entity.openingHours) 
            ? entity.openingHours.join(', ')
            : String(entity.openingHours)
        }
      }
    } catch (error) {
      // Silent fail for invalid JSON
    }
  })

  return result
}

function extractSocialLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const socialLinks = new Set<string>()
  
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')
    if (!href) return

    try {
      const url = new URL(href, baseUrl)
      SOCIAL_DOMAINS.forEach(domain => {
        if (url.hostname.includes(domain)) {
          socialLinks.add(url.toString())
        }
      })
    } catch {
      // Invalid URL, skip
    }
  })

  return Array.from(socialLinks)
}

function extractMetaData($: cheerio.CheerioAPI, baseUrl: string) {
  const title = (
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('meta[name="title"]').attr('content')
  )?.trim()

  const description = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content')
  )?.trim() || null

  // Multiple logo sources with priority
  const logoSources = [
    $('meta[property="og:logo"]').attr('content'),
    $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"][sizes="16x16"]').attr('href'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
    '/favicon.ico'
  ]

  const logo = logoSources.map(src => abs(baseUrl, src)).find(Boolean)

  return { title, description, logo }
}

function extractHours($: cheerio.CheerioAPI): string | null {
  // Look for common hours patterns
  const hoursSelectors = [
    '[class*="hours"]',
    '[class*="time"]',
    '[id*="hours"]',
    '[id*="time"]',
    '.business-hours',
    '.opening-hours'
  ]

  for (const selector of hoursSelectors) {
    const hoursText = $(selector).first().text().trim()
    if (hoursText && hoursText.length < 500) { // Reasonable length
      return hoursText.replace(/\s+/g, ' ').substring(0, 200)
    }
  }

  return null
}

function calculateServices(htmlLower: string): string | null {
  const foundServices = SERVICE_KEYWORDS.filter(keyword => 
    htmlLower.includes(keyword)
  )
  return foundServices.length > 0 ? foundServices.join('|') : null
}

function calculateConfidence(data: Partial<ScrapeOut>): number {
  let score = 0
  if (data.name) score += 20
  if (data.phone) score += 20
  if (data.email) score += 15
  if (data.address) score += 15
  if (data.services) score += 10
  if (data.logo_url) score += 10
  if (data.description) score += 10
  return Math.min(score, 100)
}

async function scrapePage(url: string): Promise<ScrapeResult> {
  try {
    const html = await fetchWithTimeout(url)
    const $ = cheerio.load(html)

    const { title, description, logo } = extractMetaData($, url)
    const phones = extractPhones($)
    const emails = extractEmails(html)
    const addr = extractJsonLdData($)
    const socialLinks = extractSocialLinks($, url)
    const hours = extractHours($)

    return {
      url,
      title,
      description,
      logo,
      phones,
      emails,
      addr,
      socialLinks,
      hours,  // This is now string | null which matches the interface
      htmlLower: html.toLowerCase()
    }
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error)
    throw error
  }
}

// ============ ROBOTS.TXT CHECK ============
async function checkRobotsTxt(website: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', website).toString()
    const robotsText = await fetchWithTimeout(robotsUrl, 5000)
    
    const blocksAll = /^\s*User-agent:\s*\*\s*[^]*?Disallow:\s*\/\s*$/im.test(robotsText)
    return !blocksAll
  } catch {
    return true // If we can't fetch robots.txt, assume it's allowed
  }
}

// ============ MAIN SCRAPING LOGIC ============
async function discoverPages(website: string): Promise<string[]> {
  const pages = new Set<string>([website])
  
  try {
    const $ = cheerio.load(await fetchWithTimeout(website))
    
    const discoverSelectors = [
      'a[href*="contact"]',
      'a[href*="about"]',
      'a[href*="services"]',
      'a[href*="locations"]',
      'a[href*="hours"]'
    ]

    discoverSelectors.forEach(selector => {
      $(selector).slice(0, 2).each((_, element) => {
        const href = $(element).attr('href')
        const absoluteUrl = abs(website, href)
        if (absoluteUrl && pages.size < SCRAPE_CONFIG.maxPages) {
          pages.add(absoluteUrl)
        }
      })
    })
  } catch (error) {
    console.warn('Page discovery failed, using homepage only:', error)
  }

  return Array.from(pages)
}

async function scrapeWebsite(website: string): Promise<ScrapeOut> {
  // Check robots.txt
  const isAllowed = await checkRobotsTxt(website)
  if (!isAllowed) {
    throw new Error('Blocked by robots.txt')
  }

  // Discover and scrape pages
  const pagesToScrape = await discoverPages(website)
  const scrapePromises = pagesToScrape.map(url => 
    scrapePage(url).catch(error => {
      console.warn(`Skipping ${url}:`, error.message)
      return null
    })
  )

  const results = (await Promise.all(scrapePromises)).filter(Boolean) as ScrapeResult[]

  if (results.length === 0) {
    throw new Error('Failed to scrape any pages')
  }

  // Merge data from all pages with priority
  const allHtml = results.map(r => r.htmlLower).join(' ')
  const primaryResult = results[0]

  const merged: ScrapeOut = {
    name: primaryResult.title || new URL(website).hostname.replace(/^www\./, ''),
    website,
    phone: results.find(r => r.phones.length)?.phones[0] || primaryResult.addr.phone || null,
    email: results.find(r => r.emails.length)?.emails[0] || primaryResult.addr.email || null,
    address: results.find(r => r.addr.address)?.addr.address || null,
    city: results.find(r => r.addr.city)?.addr.city || null,
    state: results.find(r => r.addr.state)?.addr.state || null,
    zip: results.find(r => r.addr.zip)?.addr.zip || null,
    services: calculateServices(allHtml),
    logo_url: primaryResult.logo || null,
    description: primaryResult.description || null,
    social_links: results.flatMap(r => r.socialLinks || []).slice(0, 10) || null,
    hours: results.find(r => r.hours)?.hours || primaryResult.addr.hours || null,
  }

  // Calculate confidence score
  merged.confidence_score = calculateConfidence(merged)

  return merged
}

// ============ API HANDLER ============
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const websiteParam = searchParams.get('url')
  const insert = searchParams.get('insert')?.toLowerCase() === 'true'
  const token = req.headers.get('x-admin-token') || ''

  if (!websiteParam) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const website = normUrl(websiteParam)

  try {
    // Validate URL
    new URL(website)

    const scrapedData = await scrapeWebsite(website)

    // Return early if not inserting
    if (!insert) {
      return NextResponse.json({ 
        ok: true, 
        data: scrapedData,
        meta: {
          confidence: scrapedData.confidence_score,
          timestamp: new Date().toISOString()
        }
      })
    }

    // Insert logic with authentication
    const expectedToken = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supa = adminClient()
    const { error } = await supa.from('providers').insert(
      pick(scrapedData, [
        'name', 'website', 'phone', 'email', 'address', 'city', 
        'state', 'zip', 'services', 'logo_url', 'description',
        'social_links', 'hours'
      ])
    )

    if (error) {
      console.error('Database insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      saved: true, 
      data: scrapedData,
      meta: {
        confidence: scrapedData.confidence_score,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Scraping error:', error)
    
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Scraping failed' 
    }, { status: 500 })
  }
}