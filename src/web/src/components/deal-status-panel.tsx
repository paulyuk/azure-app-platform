import type { DealStage } from "@/lib/types";

interface DealStatusPanelProps {
  stage: DealStage;
  email: string;
  onEmailChange: (value: string) => void;
  onApply: () => Promise<void>;
  isApplying: boolean;
}

const STAGES: Array<{ id: DealStage; label: string }> = [
  { id: "pending_teams_approval", label: "Pending Teams approval" },
  { id: "approved", label: "Approved" },
  { id: "offer_emailed", label: "Offer emailed" }
];

const stageRank: Record<DealStage, number> = {
  idle: -1,
  shortlisted: -1,
  pending_teams_approval: 0,
  approved: 1,
  offer_emailed: 2
};

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

export function DealStatusPanel({
  stage,
  email,
  onEmailChange,
  onApply,
  isApplying
}: DealStatusPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Deal workflow</h3>
      <p className="mt-1 text-sm text-slate-500">
        Capture customer email and submit for approval.
      </p>

      <div className="mt-4 space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Customer email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="maya@example.com"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
      </div>

      <button
        className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={!isValidEmail(email) || isApplying}
        onClick={onApply}
      >
        {isApplying ? "Submitting…" : "Apply"}
      </button>

      <ol className="mt-6 space-y-3">
        {STAGES.map((item) => {
          const current = stageRank[stage];
          const target = stageRank[item.id];
          const isComplete = current >= target && current !== -1;
          const isCurrent = current === target;

          return (
            <li
              key={item.id}
              className={`rounded-xl border px-3 py-2 text-sm ${
                isCurrent
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : isComplete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              {item.label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

