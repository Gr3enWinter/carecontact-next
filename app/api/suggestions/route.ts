// app/api/suggestions/route.ts
import { NextResponse } from 'next/server';
import { adminClient } from '../../../src/lib/supabaseServer';

const PHONE = /(\d{10})|(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;

function normPhone(p?: string|null) {
  if (!p) return null;
  const digits = p.replace(/\D/g,'');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}
function cleanUrl(u?: string|null) {
  if (!u) return null;
  const t = u.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    url.search = ''; // strip trackers
    return url.toString();
  } catch { return null; }
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const ua = req.headers.get('user-agent') || undefined;

    const body = await req.json().catch(() => ({}));
    const honeypot = (body?.company || '').toString().trim();
    if (honeypot) {
      // silently accept
      return new NextResponse(null, { status: 204 });
    }

    const kind = (body?.kind === 'clinician') ? 'clinician' : 'provider';
    const payload = {
      name: (body?.name || '').toString().slice(0, 200),
      website: cleanUrl(body?.website),
      phone: normPhone(body?.phone),
      email: (body?.email || '').toString().slice(0, 200) || null,
      address: (body?.address || '').toString().slice(0, 300) || null,
      city: (body?.city || '').toString().slice(0, 120) || null,
      state: (body?.state || '').toString().slice(0, 2).toUpperCase() || null,
      zip: (body?.zip || '').toString().slice(0, 15) || null,
      specialty: (body?.specialty || '').toString().slice(0, 200) || null,
      notes: (body?.notes || '').toString().slice(0, 1000) || null,
    };

    if (!payload.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!payload.website && !payload.phone && !payload.address) {
      return NextResponse.json({ error: 'Provide at least a website, phone, or address' }, { status: 400 });
    }

    const supa = adminClient();
    const { error } = await supa
      .from('suggestions')
      .insert({
        kind,
        payload,
        source_ip: ip,
        user_agent: ua,
      });

    if (error) {
      console.error('suggestions insert error', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
