export default function Page() {
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-3">About Care Contact Directory</h1>
      <p className="text-slate-700 max-w-3xl">
        We make it easy to find trusted care providers. Families and care coordinators use
        our directory to compare services, request callbacks, and understand options like
        home care, assisted living, and memory care.
      </p>
      <h2 className="text-2xl font-semibold mt-8 mb-2">How we help</h2>
      <ul className="list-disc pl-6 text-slate-700 space-y-1">
        <li>Search providers by city, state, and service.</li>
        <li>Short explainers—no jargon—on common care types and funding.</li>
        <li>Optional concierge help when you need a short list fast.</li>
      </ul>
      <h2 className="text-2xl font-semibold mt-8 mb-2">What we’re not</h2>
      <p className="text-slate-700 max-w-3xl">
        We don’t provide medical advice. Always confirm details with providers and your clinician.
      </p>
    </div>
  )
}
