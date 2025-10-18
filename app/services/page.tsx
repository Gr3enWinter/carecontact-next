export default function Page() {
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-3">Care Services, Explained</h1>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Home Care</h2>
        <p className="text-slate-700 max-w-3xl">
          In-home support with activities of daily living: bathing, dressing, meals, mobility, companionship.
          Usually private-pay; some long-term care policies cover it.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Assisted Living</h2>
        <p className="text-slate-700 max-w-3xl">
          Residential setting with meals, housekeeping, and help as needed. Not the same as a nursing home.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Memory Care</h2>
        <p className="text-slate-700 max-w-3xl">
          Secure assisted living specialized for dementia. Staff training and safety design are key.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Skilled Nursing</h2>
        <p className="text-slate-700 max-w-3xl">
          24/7 nursing and rehab. Short-term stays may be covered under Medicare after a qualifying hospital stay.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Paying for Care (Quick Notes)</h2>
        <ul className="list-disc pl-6 text-slate-700 space-y-1">
          <li><strong>Medicare:</strong> health/rehab, not room & board in assisted living.</li>
          <li><strong>Medicaid:</strong> varies by state; some waiver programs cover home/community services.</li>
          <li><strong>LTC Insurance:</strong> may cover in-home or facility care per policy terms.</li>
        </ul>
      </section>
    </div>
  )
}
