import type { Vehicle } from "@/lib/types";

interface ResultsGridProps {
  vehicles: Vehicle[];
}

function asCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function ResultsGrid({ vehicles }: ResultsGridProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Shortlisted vehicles</h3>
        <span className="text-sm text-slate-500">{vehicles.length} results</span>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          Ask for a vehicle search in chat to populate shortlist cards.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => (
            <article
              key={vehicle.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-slate-900 to-slate-600 text-3xl text-white">
                🚗
              </div>
              <div className="space-y-1 p-4">
                <h4 className="font-semibold text-slate-900">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h4>
                <p className="text-sm text-slate-600">
                  {asCurrency(vehicle.priceUsd)} · {vehicle.rangeMiles} mi range · {vehicle.seats} seats
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

