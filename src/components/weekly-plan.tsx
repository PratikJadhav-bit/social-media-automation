"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export default function WeeklyPlan({ brandId }: { brandId: string }) {
  const [plan, setPlan] = useState<{
      timezone: string;
      note: string;
      slots: {
        id: string;
        title: string;
        format: string;
        language: string;
        at: number;
      }[];
    } | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>A week with a clear direction.</h2>
          <p>Turn the latest ideas into a plan around your posting slots.</p>
        </div>
        <Button
          disabled={busy}
          variant="secondary"
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch(
                `/api/plan?brand=${encodeURIComponent(brandId)}`,
              );
              const j = await r.json();
              if (!r.ok) throw Error(j.error);
              setPlan(j);
              setNotice("");
            } catch {
              setNotice(
                "The plan could not load. Your ideas are unchanged; retry when the server is available.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Planning…" : "Plan upcoming posts"}
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {plan && (
        <>
          <p className="risk-note">{plan.note}</p>
          <div className="plan-grid">
            {plan.slots.map((slot) => (
              <article key={slot.id}>
                <small>
                  {new Intl.DateTimeFormat("en-IN", {
                    timeZone: plan.timezone,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(slot.at)}
                </small>
                <h3>{slot.title}</h3>
                <p>
                  {slot.format} · {slot.language}
                </p>
              </article>
            ))}
          </div>
          {!plan.slots.length && (
            <p>Discover trends or add ideas to build a plan.</p>
          )}
        </>
      )}
    </section>
  );
}
