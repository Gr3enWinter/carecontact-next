import Link from 'next/link'
import { adminClient } from '../../src/lib/supabaseServer'
function strip(html:string){return html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()}
export default async function BlogIndex(){
  const supa=adminClient()
  const { data: posts, error } = await supa.from('posts').select('slug,title,html,created_at').order('created_at',{ascending:false}).limit(50)
  if(error) return <div className="container py-10">Failed to load posts.</div>
  return (<div className="container py-10">
    <h1 className="text-3xl font-bold mb-3">Blog</h1>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {(posts??[]).map(p=>(<article key={p.slug} className="card">
        <h2 className="text-xl font-semibold"><Link href={`/blog/${p.slug}`}>{p.title}</Link></h2>
        <div className="text-xs text-slate-600 mt-1">{new Date(p.created_at as string).toLocaleDateString()}</div>
        <p className="text-slate-700 mt-2">{strip((p.html as string)||'').slice(0,180)}…</p>
        <div className="mt-3"><Link href={`/blog/${p.slug}`} className="btn">Read more</Link></div>
      </article>))}
    </div>
  </div>)
}