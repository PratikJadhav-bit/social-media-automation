"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export default function NotificationConfig({
  setup,
  onSaved,
}: {
  setup: {
    enabled: boolean;
    ready: boolean;
    missing: string[];
    hasWorkspaceURL: boolean;
  };
  onSaved: () => Promise<void>;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({}),
    [enabled, setEnabled] = useState(setup.enabled),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <form
      className="panel studio-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credentials, enabled }),
          });
          const j = await r.json();
          if (!r.ok) throw Error(j.error);
          setCredentials({});
          await onSaved();
          setNotice(
            j.setup.ready
              ? "WhatsApp configured. Open a ready package and send its alert to test delivery."
              : "Saved. Complete the missing fields and enable alerts when ready.",
          );
        } catch (e) {
          setNotice(
            e instanceof Error ? e.message : "Could not save. Try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>WhatsApp content-ready alerts</h2>
      <p>
        Discover → create → check → notify. You download the package and post it
        yourself. No social account connection is needed.
      </p>
      <div className="risk-note">
        {setup.ready
          ? "Configured; actual delivery must be tested on your phone."
          : `Setup needed: ${setup.missing.join(", ") || "enable alerts below"}`}
      </div>
      <ol>
        <li>
          Create a WhatsApp Business app in Meta and add a sender phone number.
        </li>
        <li>
          Get the access token and phone-number ID. Add your recipient to the
          allowed test numbers while testing.
        </li>
        <li>
          Create an approved utility template named <code>content_ready</code>{" "}
          with three body parameters, using the text below. Enter its actual
          name and language code.
        </li>
      </ol>
      <p className="risk-note">
        Your content package for {"{{1}}"} is ready. {"{{2}}"} Download it here:{" "}
        {"{{3}}"} You will post it manually.
      </p>
      <p>
        Parameter 1 is the topic; 2 is the readiness or preview notice; 3 is
        your website link or an instruction to open it on your computer. Use a
        body-only template without a header or button. Approval and messaging
        charges are managed by Meta.
      </p>
      <a
        className="text-link"
        href="https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api"
        target="_blank"
        rel="noreferrer"
      >
        Meta WhatsApp API setup documentation
      </a>
      <div className="form-grid">
        {[
          ["WHATSAPP_ACCESS_TOKEN", "WhatsApp access token", "Paste token"],
          [
            "WHATSAPP_PHONE_NUMBER_ID",
            "Sender phone-number ID",
            "Digits from Meta",
          ],
          [
            "WHATSAPP_RECIPIENT",
            "Your WhatsApp number",
            "Country code + number, digits only: 919876543210",
          ],
          ["WHATSAPP_TEMPLATE_NAME", "Approved template name", "content_ready"],
          [
            "WHATSAPP_TEMPLATE_LANGUAGE",
            "Template language code",
            "en or en_US — match your approved template",
          ],
          [
            "WHATSAPP_GRAPH_VERSION",
            "Graph API version",
            "Copy your supported version from Meta, e.g. v24.0",
          ],
          [
            "WHATSAPP_WORKSPACE_URL",
            "Public website URL · optional",
            "https://your-autopilot.example",
          ],
        ].map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <input
              type={key === "WHATSAPP_ACCESS_TOKEN" ? "password" : "text"}
              autoComplete="off"
              value={credentials[key] || ""}
              onChange={(e) =>
                setCredentials({ ...credentials, [key]: e.target.value })
              }
              placeholder={placeholder}
              maxLength={4096}
            />
          </label>
        ))}
      </div>
      <p>
        Blank fields keep saved values. Credentials and your number are
        encrypted. A local 127.0.0.1 link won’t open from your phone; leave the
        public URL blank to receive a desktop reminder.
      </p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        Enable automatic WhatsApp alerts for completed packages
      </label>
      <Button disabled={busy}>
        {busy ? "Saving…" : "Save WhatsApp settings"}
      </Button>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
