import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  content: ['./app/**/*.{ts,tsx}','./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { lg: '960px', xl: '1120px', '2xl': '1280px' } },
    extend: {
      colors: {
        brand: { DEFAULT: '#2563eb', soft: '#e8f0ff', dark: '#1e40af' },
        ink: { 50:'#f8fafc', 100:'#f1f5f9', 600:'#475569', 700:'#334155', 900:'#0f172a' }
      },
      boxShadow: { soft: '0 12px 30px rgba(20,25,40,.08)', ring: '0 0 0 4px rgba(37,99,235,0.12)' },
      borderRadius: { xl: '1rem', '2xl':'1.25rem' }
    }
  },
  plugins: [typography],
} satisfies Config
