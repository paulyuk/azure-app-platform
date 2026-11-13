"use client";

import type { Vehicle } from "@/lib/types";
import { Badge } from "@fluentui/react-headless-components-preview/badge";
import { Card } from "@fluentui/react-headless-components-preview/card";

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
    <Card className="rounded-token-2xl border border-border bg-surface-elev p-5 shadow-token-2">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink">Shortlisted vehicles</h3>
        <Badge className="rounded-token-pill bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
          {vehicles.length} results
        </Badge>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-token-lg border border-dashed border-border-strong bg-surface-soft p-6 text-sm text-ink-muted">
          Ask for a vehicle search in chat to populate shortlist cards.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => (
            <Card
              key={vehicle.id}
              className="overflow-hidden rounded-token-lg border border-border bg-surface-soft shadow-token-1"
            >
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-brand to-accent-strong text-3xl text-accent-contrast">
                🚗
              </div>
              <div className="space-y-1 p-4">
                <h4 className="font-display font-semibold text-ink">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h4>
                <p className="text-sm text-ink-muted">
                  {asCurrency(vehicle.priceUsd)} · {vehicle.rangeMiles} mi range · {vehicle.seats} seats
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

