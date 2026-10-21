"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import EditorialReportView from "./editorial-report";
import type { Script } from "@/lib/types";
type Platform = "instagram" | "youtube" | "linkedin";
const tools = [
  [
    "hook",
    "Score alternative hooks",
    "One hook per line. English text works best.",
  ],
  [
    "humanize",
    "Clean up a draft",
    "Paste your draft. Review replacements before using them; preserve names and factual meaning.",
  ],
  [
    "style",
    "Review writing style",
    "English draft. Local heuristics, not an AI detector or a guarantee of reach.",
  ],
  [
    "beats",
    "Time a Reel script",
    "One spoken beat per line. Timing is an estimate at 165 words per minute.",
  ],
  [
    "caption",
    "Check an Instagram caption",
    "Complete caption including hashtags. Preview is approximate; feed layouts vary.",
  ],
  [
    "title",
    "Review a YouTube title",
    "Enter the title below; optional thumbnail words help check repetition.",
  ],
  [
    "instagram-outliers",
    "Compare Instagram performance",
    "Tab-separated data with header: account, views, hook, median. Use actual collected data.",
  ],
  [
    "youtube-outliers",
    "Compare YouTube performance",
    "JSON array of {channel, title, views, url}. At least four videos per channel.",
  ],
  [
    "retention",
    "Read audience retention",
    "CSV with numeric position percentage (0–100) and retention percentage. At least eight rows. Duration is the video's length.",
  ],
  [
    "chapters",
    "Draft YouTube chapters",
    "Paste an SRT transcript with timestamps; at least six cues. Review draft chapter names.",
  ],
  [
    "edit",
    "Find transcript cuts",
    "Paste an SRT transcript. Finds dead air, fillers and repeated openings; verify cuts before editing.",
  ],
];
export default function ContentStudio({
  brandId,
  onSaved,
}: {
  brandId: string;
  onSaved: () => Promise<void>;
}) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [tool, setTool] = useState("hook"),
    [input, setInput] = useState(""),
    [title, setTitle] = useState(""),
    [thumb, setThumb] = useState("");
  const [duration, setDuration] = useState(30),
    [format, setFormat] = useState("reel"),
    [language, setLanguage] = useState("English");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<unknown>(null),
    [draft, setDraft] = useState<Script | null>(null);
  const [library, setLibrary] = useState<{
    hooks: {
      name: string;
      template?: string;
      shape?: string;
      example?: string;
      best_for?: string;
    }[];
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLibrary(null);
    fetch(
      `/api/studio?brand=${encodeURIComponent(brandId)}&platform=${platform}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        setLibrary(j.library);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setNotice(
            "Hook library is temporarily unavailable. Reload to retry.",
          );
      });
    return () => controller.abort();
  }, [brandId, platform]);
  async function request(action: string) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          action,
          tool,
          input: tool === "title" ? title : input,
          platform,
          title,
          thumbnail: thumb,
          duration,
          format,
          language,
          script: draft,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      if (action === "draft") {
        setDraft(j.script);
        setNotice(
          j.mode === "mock"
            ? "Template draft created. Connect an AI provider for a researched script; review all facts."
            : "Draft created. Review facts and sources before saving.",
        );
      } else if (action === "save") {
        await onSaved();
        setNotice(
          "Saved to the content pipeline. Open Approval Queue to review generated media.",
        );
      } else setResult(j.result);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Could not complete this request. Your input is preserved; retry when the connection returns.",
      );
    } finally {
      setBusy(false);
    }
  }
  const info = tools.find((t) => t[0] === tool)!;
  return (
    <div className="studio-layout">
      <section className="panel studio-intro">
        <span className="eyebrow">YOUR CREATIVE WORKBENCH</span>
        <h2>Make the idea worth watching.</h2>
        <p>
          Write stronger hooks, time your scripts, and review captions before
          publishing. Writing checks do not call external APIs. AI drafts use
          your connected provider.
        </p>
        <label>
          Write for
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as Platform);
              setResult(null);
            }}
          >
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
            <option value="linkedin">LinkedIn · copy-ready drafts</option>
          </select>
        </label>
      </section>
      {notice && (
        <div role="status" className="risk-note">
          {notice}
        </div>
      )}
      <div className="studio-columns">
        <section className="panel studio-form">
          <h2>Draft and repurpose</h2>
          <p>
            Use a specific topic and paste your source material to turn a
            transcript, article or existing post into a new format.
          </p>
          <label>
            Topic
            <input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What changed, and why should someone care?"
            />
          </label>
          <div className="form-grid">
            <label>
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="reel">Reel / Short</option>
                <option value="carousel">Carousel</option>
                <option value="image">Image / text post</option>
              </select>
            </label>
            <label>
              Language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {["English", "Hindi", "Marathi"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Source text or draft
            <textarea
              rows={9}
              value={input}
              maxLength={100000}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste verified source material, a transcript, or a draft to analyse."
            />
          </label>
          <Button
            disabled={busy || title.trim().length < 4}
            onClick={() => request("draft")}
          >
            {busy ? "Working…" : "Create draft"}
          </Button>
          {draft && (
            <div className="studio-draft">
              <h3>Your draft</h3>
              {(["hook", "body", "caption", "seoTitle"] as const).map((key) => (
                <label key={key}>
                  {key}
                  <textarea
                    rows={key === "body" ? 5 : 3}
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <div className="button-group">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setInput(`${draft.hook}\n${draft.body}\n${draft.cta}`);
                    setTool("style");
                    setNotice("Draft loaded into the analysis tools.");
                  }}
                >
                  Analyse this draft
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const blob = new Blob(
                      [
                        `${draft.hook}\n\n${draft.body}\n\n${draft.caption}\n\n${draft.onScreen.map((slide, index) => `Slide ${index + 1}: ${slide}`).join("\n\n")}`,
                      ],
                      { type: "text/plain;charset=utf-8" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${platform}-draft.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download draft
                </Button>
                {platform !== "linkedin" && (
                  <Button disabled={busy} onClick={() => request("save")}>
                    Save & create media
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>
        <section className="panel studio-form">
          <h2>Make every line earn its place.</h2>
          <label>
            Editorial tool
            <select
              value={tool}
              onChange={(e) => {
                setTool(e.target.value);
                setResult(null);
              }}
            >
              {tools.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted-text">{info[2]}</p>
          {tool === "title" && (
            <label>
              Thumbnail words
              <input
                value={thumb}
                maxLength={100}
                onChange={(e) => setThumb(e.target.value)}
                placeholder="Up to three complementary words"
              />
            </label>
          )}
          {["beats", "retention"].includes(tool) && (
            <label>
              Target duration (seconds)
              <input
                type="number"
                min={15}
                max={tool === "retention" ? 86400 : 45}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
          )}
          <Button
            disabled={busy || !(tool === "title" ? title : input).trim()}
            onClick={() => request("analyse")}
          >
            {busy ? "Analysing…" : "Run analysis"}
          </Button>
          {result !== null && (
            <div className="studio-report">
              <h3>Analysis report</h3>
              {tool === "humanize" &&
                typeof result === "object" &&
                result &&
                "text" in result && (
                  <>
                    <textarea
                      aria-label="Cleaned draft"
                      rows={7}
                      readOnly
                      value={String(result.text)}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setInput(String(result.text));
                        setNotice(
                          "Cleaned text loaded. Check factual meaning before saving.",
                        );
                      }}
                    >
                      Use cleaned text
                    </Button>
                  </>
                )}
              <EditorialReportView value={result} />
              <p className="muted-text">
                Scores describe text properties. They do not predict views,
                verify facts or identify whether an author used AI.
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>{library?.hooks.length || 0} hook formulas to work from</h2>
        <p>
          Choose a shape that fits your evidence. Example claims are
          illustrations, not facts to reuse.
        </p>
        <div className="hook-grid">
          {library?.hooks.map((hook, index) => (
            <details key={index}>
              <summary>{hook.name}</summary>
              <p>{hook.template || hook.shape}</p>
              <p className="muted-text">{hook.best_for}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setInput(hook.template || hook.shape || "");
                  setTool("hook");
                }}
              >
                Use this structure
              </Button>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
