// app/admin/scrape/page.tsx
'use client'

import { useState } from 'react'

interface ScrapeResultSuccess {
  ok: true
  data: any
  meta?: any
  saved?: boolean
}

interface ScrapeResultError {
  ok: false
  error: string
}

type ScrapeResult = ScrapeResultSuccess | ScrapeResultError

interface ScrapeConfig {
  url: string
  mode: 'single' | 'directory' | 'pagination'
  maxPages: number
  maxDepth: number
  insert: boolean
  token: string
}

export default function ScrapeAdmin() {
  const [config, setConfig] = useState<ScrapeConfig>({
    url: '',
    mode: 'single',
    maxPages: 10,
    maxDepth: 2,
    insert: false,
    token: ''
  })

  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ScrapeConfig[]>([])

  const handleScrape = async () => {
    if (!config.url) { alert('Please enter a URL'); return }

    setLoading(true)
    setResult(null)

    try {
      const params = new URLSearchParams({
        url: config.url,
        maxPages: String(config.maxPages),
        maxDepth: String(config.maxDepth),
        insert: String(config.insert),
      })

      const endpoint =
        config.mode === 'single'
          ? '/api/scrape/provider'
          : config.mode === 'directory'
          ? '/api/scrape/directory'
          : '/api/scrape/pagination'

      const resp = await fetch(`${endpoint}?${params}`, {
        headers: config.insert ? { 'x-admin-token': config.token } : undefined,
      })

      const ct = resp.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        const txt = await resp.text()
        setResult({ ok: false, error: `Non-JSON response (${resp.status}). First bytes: ${txt.slice(0,120)}` })
        return
      }

      const data = await resp.json()
      setResult(data as any)

      if ((data as any).ok) {
        setHistory((prev) => [config, ...prev.slice(0, 9)])
      }
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }


  const loadFromHistory = (historicConfig: ScrapeConfig) => {
    setConfig(historicConfig)
  }

  const presetExamples = [
    {
      name: 'Single Provider',
      config: {
        url: 'https://example-senior-care.com',
        mode: 'single' as const,
        maxPages: 1,
        maxDepth: 1,
        insert: false,
        token: ''
      }
    },
    {
      name: 'Provider Directory',
      config: {
        url: 'https://communitycare.com/practices/',
        mode: 'directory' as const,
        maxPages: 5,
        maxDepth: 2,
        insert: false,
        token: ''
      }
    },
    {
      name: 'Paginated List',
      config: {
        url: 'https://homehealth-agencies.com/list',
        mode: 'pagination' as const,
        maxPages: 3,
        maxDepth: 1,
        insert: false,
        token: ''
      }
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Website Scraper Admin</h1>
          <p className="text-gray-600 mt-2">Extract provider information from websites</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Config Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Scraping Configuration</h2>
              
              {/* URL Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website URL *
                </label>
                <input
                  type="url"
                  value={config.url}
                  onChange={(e) => setConfig(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Mode Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scraping Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'single', label: 'Single Page', desc: 'One website' },
                    { value: 'directory', label: 'Directory', desc: 'Multiple providers' },
                    { value: 'pagination', label: 'Pagination', desc: 'Multiple pages' }
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, mode: mode.value as any }))}
                      className={`p-3 border rounded-md text-left ${
                        config.mode === mode.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{mode.label}</div>
                      <div className="text-sm text-gray-500">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Pages
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={config.maxPages}
                    onChange={(e) => setConfig(prev => ({ ...prev, maxPages: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Depth
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={config.maxDepth}
                    onChange={(e) => setConfig(prev => ({ ...prev, maxDepth: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Insert Settings */}
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="insert"
                    checked={config.insert}
                    onChange={(e) => setConfig(prev => ({ ...prev, insert: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="insert" className="ml-2 block text-sm text-gray-900">
                    Save to database
                  </label>
                </div>

                {config.insert && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Admin Token *
                    </label>
                    <input
                      type="password"
                      value={config.token}
                      onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
                      placeholder="Enter admin token"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleScrape}
                  disabled={loading || !config.url}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Scraping...' : 'Start Scraping'}
                </button>
                
                <button
                  onClick={() => setConfig({
                    url: '',
                    mode: 'single',
                    maxPages: 10,
                    maxDepth: 2,
                    insert: false,
                    token: ''
                  })}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Results Panel */}
            {result && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">
                  {result.ok ? (
                    <>Results {result.meta?.count && `(${result.meta.count} providers)`}</>
                  ) : (
                    'Scraping Error'
                  )}
                </h2>
                
                {!result.ok ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="text-red-800 font-medium">Error</div>
                    <div className="text-red-600 mt-1">{result.error}</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {result.saved && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="text-green-800 font-medium">Successfully saved to database!</div>
                      </div>
                    )}
                    
                    <div className="border border-gray-200 rounded-md">
                      <pre className="p-4 overflow-auto max-h-96 text-sm">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>

                    {result.meta && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-gray-500">Mode</div>
                          <div className="font-medium">{result.meta.mode}</div>
                        </div>
                        {result.meta.confidence && (
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="text-gray-500">Confidence</div>
                            <div className="font-medium">{result.meta.confidence}%</div>
                          </div>
                        )}
                        {result.meta.count && (
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="text-gray-500">Providers</div>
                            <div className="font-medium">{result.meta.count}</div>
                          </div>
                        )}
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-gray-500">Time</div>
                          <div className="font-medium">{new Date(result.meta.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Preset Examples */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-3">Quick Examples</h3>
              <div className="space-y-2">
                {presetExamples.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setConfig(prev => ({ ...prev, ...example.config }))}
                    className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="font-medium text-sm">{example.name}</div>
                    <div className="text-xs text-gray-500 truncate">{example.config.url}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Recent Scrapes</h3>
                <div className="space-y-2">
                  {history.map((historicConfig, index) => (
                    <button
                      key={index}
                      onClick={() => loadFromHistory(historicConfig)}
                      className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="font-medium text-sm truncate">{historicConfig.url}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {historicConfig.mode} • {historicConfig.maxPages} pages
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Help & Tips */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">Scraping Tips</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• <strong>Single Mode</strong>: Best for individual provider websites</li>
                <li>• <strong>Directory Mode</strong>: For pages listing multiple providers</li>
                <li>• <strong>Pagination Mode</strong>: For multi-page lists with next buttons</li>
                <li>• Start with small max pages/depth to test</li>
                <li>• Use directory mode for sites like communitycare.com/practices/</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}