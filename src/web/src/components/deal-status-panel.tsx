"use client";

import type { DealStage } from "@/lib/types";
import { Button } from "@fluentui/react-headless-components-preview/button";
import { Card } from "@fluentui/react-headless-components-preview/card";
import { Input } from "@fluentui/react-headless-components-preview/input";
import { Label } from "@fluentui/react-headless-components-preview/label";

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
    <Card className="rounded-token-2xl border border-border bg-surface-elev p-5 shadow-token-2">
      <h3 className="font-display text-lg font-semibold text-ink">Deal workflow</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Capture customer email and submit for approval.
      </p>

      <div className="mt-4 space-y-2">
        <Label className="block text-sm font-medium text-ink" htmlFor="email">
          Customer email
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(_event, data) => onEmailChange(data.value)}
          placeholder="maya@example.com"
          root={{ className: "block w-full" }}
          input={{
            className:
              "w-full rounded-token-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
          }}
        />
      </div>

      <Button
        className="mt-4 w-full rounded-token-lg bg-status-success px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 data-[disabled=true]:opacity-50"
        disabled={!isValidEmail(email) || isApplying}
        onClick={onApply}
      >
        {isApplying ? "Submitting…" : "Apply"}
      </Button>

      <ol className="mt-6 space-y-3">
        {STAGES.map((item) => {
          const current = stageRank[stage];
          const target = stageRank[item.id];
          const isComplete = current >= target && current !== -1;
          const isCurrent = current === target;

          return (
            <li
              key={item.id}
              className={`rounded-token-lg border px-3 py-2 text-sm font-medium ${
                isCurrent
                  ? "border-status-warning bg-status-warning-soft text-status-warning"
                  : isComplete
                    ? "border-status-success bg-status-success-soft text-status-success"
                    : "border-border bg-surface-soft text-ink-muted"
              }`}
            >
              {item.label}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

