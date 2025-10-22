// app/admin/suggestions/page.tsx
import { adminClient } from '../../../src/lib/supabaseServer';

export const dynamic = 'force-dynamic';

function slugify(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
function cleanHost(u?: string|null) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./,'');
  } catch { return null; }
}
function lastPathSlug(u?: string|null) {
  if (!u) return null;
  try {
    const url = new URL(u);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ? slugify(parts[parts.length - 1]) : null;
  } catch { return null; }
}

async function upsertProviderFromSuggestion(supa: ReturnType<typeof adminClient>, p: any) {
  // pick a good slug
  let slug =
    // if it's obviously a /practices/{slug}/ style, prefer last segment
    (p.website && lastPathSlug(p.website)) ||
    // else from name
    (p.name ? slugify(p.name) : null) ||
    // else from host
    (p.website ? slugify(cleanHost(p.website)!) : 'provider');

  // try identify existing row by slug or by host/phone
  const host = cleanHost(p.website);
  const phone = (p.phone || null);

  let existing: any = null;
  const { data: bySlug } = await supa.from('providers').select('*').eq('slug', slug).limit(1);
  existing = bySlug?.[0] || null;

  if (!existing && host) {
    const { data: byWeb } = await supa
      .from('providers')
      .select('*')
      .ilike('website', `%${host}%`)
      .limit(1);
    existing = byWeb?.[0] || null;
    if (existing) slug = existing.slug;
  }
  if (!existing && phone) {
    const { data: byPhone } = await supa.from('providers').select('*').eq('phone', phone).limit(1);
    if (byPhone?.[0]) {
      existing = byPhone[0];
      slug = existing.slug;
    }
  }

  const row = {
    slug,
    name: p.name ?? existing?.name ?? null,
    website: p.website ?? existing?.website ?? null,
    phone: p.phone ?? existing?.phone ?? null,
    email: p.email ?? existing?.email ?? null,
    address: p.address ?? existing?.address ?? null,
    city: p.city ?? existing?.city ?? null,
    state: p.state ?? existing?.state ?? null,
    zip: p.zip ?? existing?.zip ?? null,
    services: p.specialty ? (existing?.services ? existing.services : p.specialty.toLowerCase()) : existing?.services ?? null,
    description: p.notes ?? existing?.description ?? null,
    logo_url: existing?.logo_url ?? null, // can enrich later
  };

  const { error } = await supa.from('providers').upsert(row, { onConflict: 'slug' });
  if (error) throw new Error(error.message);
  return slug;
}

async function upsertClinicianFromSuggestion(
  supa: ReturnType<typeof adminClient>,
  payload: any
) {
  // ensure practice exists first
  const practiceWebsite = payload.practice_website || payload.website || null;
  const practiceName = payload.practice_name || null;

  const practicePayload = {
    name: practiceName || payload.practice_name || null,
    website: practiceWebsite,
    phone: payload.phone || null, // not perfect, but often the same
    email: payload.email || null,
    address: payload.address || null,
    city: payload.city || null,
    state: payload.state || null,
    zip: payload.zip || null,
    specialty: payload.specialty || null,
    notes: payload.notes || null,
  };

  const practice_slug = await upsertProviderFromSuggestion(supa, {
    ...practicePayload,
    name: practicePayload.name || 'Practice',
  });

  // clinician slug from profile url or name
  const clinician_slug = lastPathSlug(payload.profile_url) || slugify(payload.name);

  // upsert clinician
  const { error: cErr } = await supa.from('clinicians').upsert([{
    practice_slug,
    slug: clinician_slug,
    name: payload.name || null,
    role: null,
    profile_url: payload.profile_url || null,
    photo_url: payload.photo_url || null,
    specialties: payload.specialty ? [payload.specialty] : null,
    languages: null,
    accepting_new_patients: null,
    booking_url: null,
    education_training: null,
    source_url: payload.profile_url || payload.website || null,
    last_seen_at: new Date().toISOString(),
  }], { onConflict: 'practice_slug,slug' });
  if (cErr) throw new Error(cErr.message);

  return { practice_slug, clinician_slug };
}

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

  // ---- server actions
  async function approve(id: string) {
    'use server';
    const supa = adminClient();

    const { data: sugg, error: sErr } = await supa
      .from('suggestions').select('*').eq('id', id).single();
    if (sErr || !sugg) throw new Error(sErr?.message || 'Missing suggestion');

    const p = sugg.payload || {};

    if (sugg.kind === 'provider') {
      await upsertProviderFromSuggestion(supa, p);
    } else {
      // clinician
      await upsertClinicianFromSuggestion(supa, p);
    }

    const { error: markErr } = await supa
      .from('suggestions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' })
      .eq('id', id);
    if (markErr) throw new Error(markErr.message);
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
                    {s.kind === 'clinician' && s.payload?.practice_website && (
                      <div className="md:col-span-2">
                        <span className="text-slate-500">Practice page:</span>{' '}
                        <a className="text-blue-600 underline" href={s.payload.practice_website} target="_blank">{s.payload.practice_website}</a>
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
