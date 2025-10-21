'use client';

export type Clinician = {
  practice_slug: string | null;
  slug: string;
  name: string;
  role?: string | null;
  profile_url?: string | null;
  photo_url?: string | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  accepting_new_patients?: boolean | null;
  last_seen_at?: string | null;
  booking_url?: string | null;  // <-- make optional
};

export default function ClinicianCard({ c }: { c: Clinician }) {
  return (
    <article className="card flex items-center gap-4">
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center">
        {c.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-slate-400 text-sm">No photo</span>
        )}
      </div>

      <div className="min-w-0">
        <div className="font-semibold truncate">{c.name}</div>
        <div className="text-sm text-slate-600 truncate">
          {c.role ?? 'Clinician'} {c.specialties?.length ? `• ${c.specialties.join(', ')}` : ''}
        </div>
        <div className="flex gap-3 text-sm">
          {c.profile_url && (
            <a className="text-blue-600 hover:underline" href={c.profile_url} target="_blank" rel="noopener noreferrer">
              Profile
            </a>
          )}
          {c.booking_url && (
            <a className="text-blue-600 hover:underline" href={c.booking_url} target="_blank" rel="noopener noreferrer">
              Book
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
