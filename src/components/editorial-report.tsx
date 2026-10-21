"use client";
type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export default function EditorialReportView({ value }: { value: unknown }) {
  const root = object(value);
  const cards = Array.isArray(value) ? value : [root];
  return (
    <div>
      {cards.map((card, index) => {
        const r = object(card),
          score = r.score ?? r.human_score;
        return (
          <div key={index}>
            {typeof score === "number" && (
              <div className="report-score">
                <b>{String(r.hook || r.title || "Writing style")}</b>
                <strong>{Math.round(score)} / 100</strong>
                <meter min={0} max={100} value={score} />
                {!!r.verdict && <small>{String(r.verdict)}</small>}
              </div>
            )}
            {!!r.checks &&
              !Array.isArray(r.checks) &&
              Object.entries(object(r.checks)).map(([name, check]) => {
                const c = object(check);
                return (
                  <div className="report-score" key={name}>
                    <b>{name.replaceAll("_", " ")}</b>
                    <strong>{String(c.score || 0)}</strong>
                    <meter min={0} max={100} value={Number(c.score) || 0} />
                    <small>{String(c.detail || "")}</small>
                  </div>
                );
              })}
            {Array.isArray(r.checks) && (
              <ul className="studio-checks">
                {r.checks.map((check, i) => {
                  const c = object(check);
                  return (
                    <li key={i}>
                      <b>
                        {String(c.status)} · {String(c.check)}
                      </b>
                      <br />
                      {String(c.detail)}
                    </li>
                  );
                })}
              </ul>
            )}
            {typeof r.visible === "string" && (
              <>
                <h4>Approximate feed preview</h4>
                <div className="caption-window">
                  {r.visible}
                  {r.truncated ? " … more" : ""}
                </div>
              </>
            )}
            {(list(r.flags).length > 0 ||
              list(r.issues).length > 0 ||
              list(r.notes).length > 0) && (
              <ul className="studio-checks">
                {[...list(r.flags), ...list(r.issues), ...list(r.notes)].map(
                  (note, i) => (
                    <li key={i}>
                      {Array.isArray(note) ? String(note[1]) : String(note)}
                    </li>
                  ),
                )}
              </ul>
            )}
            {typeof r.total_seconds === "number" && (
              <h4>Estimated speaking time · {r.total_seconds}s</h4>
            )}
            {list(r.beats).map((beat, i) => {
              const b = object(beat);
              return (
                <div className="beat-row" key={i}>
                  <b>{Number(b.start).toFixed(1)}s</b>
                  <span>{String(b.text)}</span>
                  <small>
                    {Number(b.dur).toFixed(1)}s ·{" "}
                    {list(b.flags).map(String).join("; ")}
                  </small>
                </div>
              );
            })}
            {typeof r.hook_leak === "number" && (
              <div className="report-score">
                <b>Opening retention loss</b>
                <strong>{r.hook_leak}%</strong>
                <small>
                  {r.points as number} observed data points. Investigate the
                  first hook and compare the cliffs with the transcript.
                </small>
              </div>
            )}
            {["outliers", "reels", "cliffs", "chapters", "cuts"].map((key) =>
              list(r[key]).length ? (
                <div key={key}>
                  <h4>{key[0].toUpperCase() + key.slice(1)}</h4>
                  {list(r[key])
                    .slice(0, 30)
                    .map((entry, i) => (
                      <div className="caption-window" key={i}>
                        {Object.entries(object(entry))
                          .filter(
                            ([k]) =>
                              !["checks", "hook_checks", "flags"].includes(k),
                          )
                          .map(([k, v]) => (
                            <div key={k}>
                              <b>{k.replaceAll("_", " ")}: </b>
                              {typeof v === "object"
                                ? JSON.stringify(v)
                                : String(v)}
                            </div>
                          ))}
                      </div>
                    ))}
                </div>
              ) : null,
            )}
          </div>
        );
      })}
      <details>
        <summary>Full report and export data</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}
