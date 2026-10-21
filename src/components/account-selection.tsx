"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
export default function AccountSelection({
  onConnected,
}: {
  onConnected: () => Promise<void>;
}) {
  const [pending, setPending] = useState<{
      platform: string;
      accounts: { id: string; name: string }[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/connect/accounts")
      .then((r) => r.json())
      .then((j) => {
        if (j.accounts?.length) setPending(j);
      })
      .catch(() => {});
  }, []);
  if (!pending) return null;
  return (
    <section className="panel studio-form">
      <h2>Choose your {pending.platform} publishing account</h2>
      <p>
        More than one eligible account is available. Choose which one this
        channel should publish to.
      </p>
      {pending.accounts.map((account) => (
        <Button
          key={account.id}
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/connect/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: account.id }),
              });
              const j = await r.json();
              if (!r.ok) throw Error(j.error);
              setPending(null);
              await onConnected();
            } catch (e) {
              setNotice(
                e instanceof Error
                  ? e.message
                  : "Reconnect and choose an account again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {account.name} · {account.id}
        </Button>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
