// src/components/ClinicianCard.tsx
export type Clinician = {
  practice_slug: string
  slug: string
  name: string
  role: string | null
  profile_url: string | null
  photo_url: string | null
  specialties: string[] | null
  languages: string[] | null
  accepting_new_patients: boolean | null
  booking_url: string | null
}

export default function ClinicianCard({ c }: { c: Clinician }) {
  return (
    <article className="rounded-2xl border bg-white overflow-hidden shadow-sm flex gap-4 p-4">
      <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 border shrink-0">
        {c.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="text-lg font-semibold">{c.name}</div>
        {c.role ? <div className="text-slate-600 text-sm">{c.role}</div> : null}
        {c.specialties?.length ? (
          <div className="text-xs text-slate-700">
            {c.specialties.join(' • ')}
          </div>
        ) : null}
        {c.languages?.length ? (
          <div className="text-xs text-slate-500">Languages: {c.languages.join(', ')}</div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          {c.accepting_new_patients ? (
            <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
              Accepting new patients
            </span>
          ) : null}
          {c.booking_url ? (
            <a className="btn btn-primary" href={c.booking_url} target="_blank" rel="noopener noreferrer">
              Book
            </a>
          ) : null}
          {c.profile_url ? (
            <a className="btn" href={c.profile_url} target="_blank" rel="noopener noreferrer">
              Profile
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}
