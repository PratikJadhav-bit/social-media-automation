"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export default function ConnectionConfig({
  onSaved,
  mode,
  publishingEnabled,
  publicMediaURL = "",
}: {
  onSaved: () => Promise<void>;
  mode: string;
  publishingEnabled: boolean;
  publicMediaURL: string;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [selectedMode, setMode] = useState(mode),
    [mediaURL, setMediaURL] = useState(publicMediaURL),
    [publish, setPublish] = useState(publishingEnabled);
  return (
    <form
      className="panel studio-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        try {
          const r = await fetch("/api/configuration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              credentials,
              mode: selectedMode,
              publishingEnabled: false,
            }),
          });
          const j = await r.json();
          if (!r.ok) throw Error(j.error);
          setCredentials({});
          await onSaved();
          setNotice(
            "Configuration saved. Credentials stay encrypted. AI settings take effect on the next draft.",
          );
        } catch (e) {
          setNotice(
            e instanceof Error
              ? e.message
              : "Could not save configuration. Your entries are preserved for retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Content engine</h2>
      <p>
        Add an optional AI provider key for original drafts. Leave a field blank
        to keep its saved value. Saving here takes effect immediately; no file
        editing is needed.
      </p>
      <div className="form-grid">
        {[
          ["GEMINI_API_KEY", "Gemini API key · optional"],
          ["GROQ_API_KEY", "Groq API key · optional"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              type="password"
              autoComplete="new-password"
              value={credentials[name] || ""}
              onChange={(e) =>
                setCredentials({ ...credentials, [name]: e.target.value })
              }
              placeholder="Blank keeps the existing value"
              maxLength={4096}
            />
          </label>
        ))}
      </div>
      <label>
        Content engine
        <select value={selectedMode} onChange={(e) => setMode(e.target.value)}>
          <option value="mock">Local templates · no provider requests</option>
          <option value="live">
            Connected AI providers · template fallback
          </option>
        </select>
      </label>
      <Button disabled={busy}>{busy ? "Saving…" : "Save configuration"}</Button>
      {notice && (
        <p role="status" className="risk-note">
          {notice}
        </p>
      )}
    </form>
  );
}
