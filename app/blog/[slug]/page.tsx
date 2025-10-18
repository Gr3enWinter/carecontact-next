import { adminClient } from '../../../src/lib/supabaseServer'
import Link from 'next/link'
import { notFound } from 'next/navigation'
type Props={ params:{ slug:string } }
export default async function BlogPost({ params }:Props){
  const supa=adminClient()
  const { data, error } = await supa.from('posts').select('title,html,created_at').eq('slug', params.slug).maybeSingle()
  if(error) throw error
  if(!data) return notFound()
  return (<div className="container py-10">
    <Link href="/blog" className="btn">← Back to blog</Link>
    <h1 className="text-3xl font-bold mt-4">{data.title}</h1>
    <div className="text-xs text-slate-600 mt-1">{new Date(data.created_at as string).toLocaleDateString()}</div>
    <article className="prose max-w-none mt-6" dangerouslySetInnerHTML={{ __html: data.html as string }} />
  </div>)
}