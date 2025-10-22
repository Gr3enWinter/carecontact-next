// app/admin/suggestions/page.tsx
import { adminClient } from '@/src/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export default async function SuggestionsAdminPage() {
  const supa = adminClient();
  const { data, error } = await supa
    .from('suggestions')
    .select('*')
    .eq('status','pending')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return <div className="container py-10">Error loading suggestions.</div>;
  }

  async function approve(id: string, formData: FormData) {
    'use server';
    const supa = adminClient();
    const { error: upErr } = await supa
      .from('suggestions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' })
      .eq('id', id);
    if (upErr) throw new Error(upErr.message);
  }

  async function reject(id: string) {
    'use server';
    const supa = adminClient();
    const { error: upErr } = await supa
      .from('suggestions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' })
      .eq('id', id);
    if (upErr) throw new Error(upErr.message);
  }

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-4">Suggestions</h1>
      {(data?.length ?? 0) === 0 ? (
        <div className="text-slate-500">No pending suggestions.</div>
      ) : (
        <ul className="space-y-4">
          {data!.map((s:any) => (
            <li key={s.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">{s.kind.toUpperCase()} • {new Date(s.created_at).toLocaleString()}</div>
                  <h2 className="text-xl font-semibold">{s.payload?.name}</h2>
                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm">
                    {s.payload?.website && <div><span className="text-slate-500">Website:</span> <a className="text-blue-600 underline" href={s.payload.website} target="_blank">{s.payload.website}</a></div>}
                    {s.payload?.phone && <div><span className="text-slate-500">Phone:</span> {s.payload.phone}</div>}
                    {s.payload?.email && <div><span className="text-slate-500">Email:</span> {s.payload.email}</div>}
                    {s.payload?.specialty && <div><span className="text-slate-500">Specialty:</span> {s.payload.specialty}</div>}
                    {(s.payload?.address || s.payload?.city || s.payload?.state || s.payload?.zip) && (
                      <div className="md:col-span-2">
                        <span className="text-slate-500">Address:</span>{' '}
                        {[s.payload.address, s.payload.city, s.payload.state, s.payload.zip].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {s.payload?.notes && <div className="md:col-span-2"><span className="text-slate-500">Notes:</span> {s.payload.notes}</div>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <form action={approve.bind(null, s.id)}>
                    <button className="btn btn-primary">Approve</button>
                  </form>
                  <form action={reject.bind(null, s.id)}>
                    <button className="btn" type="submit">Reject</button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
