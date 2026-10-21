"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Camera as Instagram,
  Layers,
  Link2,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Video,
  X,
  SquarePlay as Youtube,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import ContentStudio from "./content-studio";
import NotificationConfig from "./notification-config";
import ConnectionConfig from "./connection-config";
import AccountSelection from "./account-selection";
import WeeklyPlan from "./weekly-plan";
import type { Asset, BrandSettings, Post, Script } from "@/lib/types";
import { platformsForFormat } from "@/lib/types";
type Metric = {
  id: string;
  platform: string;
  day: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_seconds: number;
  title: string;
  mode: string;
};
type Job = {
  id: string;
  stage: string;
  status: string;
  attempts: number;
  error: string;
  run_at: number;
};
type Data = {
  manualPosting: boolean;
  whatsapp: {
    enabled: boolean;
    ready: boolean;
    missing: string[];
    hasWorkspaceURL: boolean;
  };
  ideaSources: {
    postId: string;
    source: string;
    url?: string;
    score: number;
  }[];
  connectionSetup: Record<
    string,
    { ready: boolean; missing: string[]; redirectUri: string }
  >;
  brandId: string;
  brands: { id: string; name: string }[];
  settings: BrandSettings;
  posts: Post[];
  connections: { platform: string; account_id: string; mode: string }[];
  jobs: Job[];
  logs: {
    id: string;
    level: string;
    event: string;
    detail: string;
    created_at: number;
  }[];
  metrics: Metric[];
  usage: { provider: string; units: number; limit: number; percent: number }[];
  comments: {
    id: string;
    body: string;
    draft: string;
    status: string;
    platform: string;
  }[];
  feedHealth: {
    checkedAt: number;
    sources: { name: string; count: number; status: string }[];
  } | null;
  readiness: { id: string; label: string; state: string; detail: string }[];
  publishingEnabled: boolean;
  publicMediaURL: string;
  engineReady: boolean;
  mode: string;
};
const nav = [
  { name: "Overview", icon: Layers },
  { name: "Content Calendar", icon: CalendarDays },
  { name: "Ready Packages", icon: CheckCircle2 },
  { name: "Trends & Ideas", icon: BookOpen },
  { name: "Content Studio", icon: Sparkles },
  { name: "Asset Library", icon: FolderOpen },
  { name: "Analytics", icon: BarChart3 },
  { name: "Notifications & AI", icon: Link2 },
  { name: "Channel Settings", icon: Settings2 },
  { name: "Logs & Jobs", icon: Activity },
];
const parsed = <T,>(s: string | null, fallback: T): T => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};
const date = (t: number) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(t);
function Platform({ name }: { name: string }) {
  return (
    <span className={`platform ${name}`} title={name}>
      {name === "instagram" ? (
        <Instagram size={14} />
      ) : name === "youtube" ? (
        <Youtube size={15} />
      ) : (
        <b>f</b>
      )}
    </span>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>
      <span />
      {value.replace(/_/g, " ")}
    </span>
  );
}
export default function Dashboard() {
  const [page, setPage] = useState("Overview"),
    [data, setData] = useState<Data | null>(null),
    [brand, setBrand] = useState("default"),
    [busy, setBusy] = useState(false),
    [loadFailed, setLoadFailed] = useState(false),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Post | null>(null),
    [settings, setSettings] = useState<BrandSettings | null>(null),
    [month, setMonth] = useState(() => new Date()),
    [title, setTitle] = useState(""),
    [format, setFormat] = useState("reel"),
    [language, setLanguage] = useState("English");
  useEffect(() => setSearch(""), [page, brand]);
  const currentBrand = useRef(brand);
  currentBrand.current = brand;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("brand")) setBrand(params.get("brand")!);
    if (
      params.has("connectionError") ||
      params.has("connected") ||
      params.has("selectAccount")
    ) {
      setPage("Notifications & AI");
      if (params.get("brand")) setBrand(params.get("brand")!);
      setNotice(
        params.get("connectionError") ||
          (params.has("selectAccount")
            ? "Choose a publishing account below."
            : "Account connected successfully."),
      );
      window.history.replaceState(null, "", "/");
    }
  }, []);
  const load = useCallback(async () => {
    const r = await fetch(`/api/workspace?brand=${encodeURIComponent(brand)}`);
    const d = await r.json();
    if (!r.ok)
      throw Error(
        r.status === 401
          ? "Sign in to access your workspace."
          : "The workspace could not load. Please retry.",
      );
    if (currentBrand.current !== brand) return;
    setLoadFailed(false);
    setData(d);
    setSelected((previous) =>
      previous ? d.posts.find((p: Post) => p.id === previous.id) || null : null,
    );
    setSettings(d.settings);
  }, [brand]);
  useEffect(() => {
    setSelected(null);
    load().catch((e) => {
      setLoadFailed(true);
      setNotice(
        e instanceof Error
          ? e.message
          : "The server is temporarily unavailable. Your saved content is unchanged.",
      );
    });
  }, [load]);
  useEffect(() => {
    if (!data?.jobs.some((job) => ["pending", "running"].includes(job.status)))
      return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/workspace?brand=${encodeURIComponent(brand)}`)
        .then(async (r) => {
          if (!r.ok) return;
          const fresh = await r.json();
          if (fresh.brandId !== currentBrand.current) return;
          setData(fresh);
          setSelected((previous) =>
            previous
              ? fresh.posts.find((p: Post) => p.id === previous.id) || null
              : null,
          );
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [brand, data?.jobs]);
  useEffect(() => {
    if (!data) return;
    const id = new URLSearchParams(window.location.search).get("post");
    if (id) {
      const p = data.posts.find((p) => p.id === id);
      if (p) setSelected(p);
    }
  }, [data?.brandId]);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, brandId: brand, ...extra }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      await load();
      setNotice(
        action === "run"
          ? j.processed === 0
            ? "No content or notification jobs are due yet."
            : `Processed ${j.processed} jobs. Check the queue for any remaining steps.`
          : action === "approve"
            ? "Approved and added to the next posting slot."
            : action === "generate"
              ? ["review", "ready"].includes(j.postStatus)
                ? "Package completed. Open Ready Packages to download and review it."
                : "Generation is queued. Watch Logs & Jobs for progress."
              : action === "research"
                ? "Trend scan queued."
                : "Changes saved.",
      );
      return true;
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message.replace(/^Error: /, "")
          : "This step could not finish. Your input is preserved; try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const posts =
      data?.posts.filter((p) =>
        `${p.title} ${p.language} ${p.status}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) || [],
    review = posts.filter((p) => ["review", "ready"].includes(p.status)),
    scheduled = posts.filter((p) =>
      ["scheduled", "publishing"].includes(p.status),
    ),
    published = posts.filter((p) => ["posted", "published"].includes(p.status)),
    views = data?.metrics.reduce((n, m) => n + m.views, 0) || 0;
  const current =
    data?.brands.find((b) => b.id === brand)?.name || "My Creator Channel";
  const overview = page === "Overview";
  function postCard(p: Post) {
    const a = parsed<Asset[]>(p.assets, []),
      s = parsed<Script | null>(p.script, null);
    return (
      <article className="post-card" key={p.id}>
        <button
          className={`post-art art-${p.format}`}
          onClick={() => setSelected(p)}
        >
          {a[0]?.kind === "image" ? (
            <img src={`/api/media/${a[0].path}`} alt={p.title} />
          ) : (
            <>
              <span className="art-kicker">EVERYDAY LEGAL</span>
              <span>{p.title}</span>
              <span className="art-footer">STAY CURIOUS ↗</span>
            </>
          )}
          <span className="format-tag">
            {p.format === "reel" ? <Video size={12} /> : <Layers size={12} />}{" "}
            {p.format === "reel" ? "Reel / Short" : p.format}
          </span>
        </button>
        <div className="post-info">
          <div className="post-meta">
            <Status value={p.status} />
            <span>{p.language}</span>
          </div>
          <h3>{p.title}</h3>
          <div className="post-bottom">
            <span>
              {p.scheduled_at ? date(p.scheduled_at) : "Manual posting"}
            </span>
            <div className="platforms">
              {platformsForFormat(p.format).map((name) => (
                <Platform key={name} name={name} />
              ))}
            </div>
          </div>
          {s && (
            <small>
              {s.duration}s ·{" "}
              {a.some((x) => x.mock) ? "Mock preview" : "Generated assets"}
            </small>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="wordmark" href="/">
          <span className="brandmark">
            a<span />
          </span>
          autopilot<span className="wordmark-dot">.</span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => {
            const name = prompt("Name for a new creator channel");
            if (name) action("brand", { name });
          }}
        >
          <span className="workspace-avatar">EL</span>
          <span>
            <b>{current}</b>
            <small>Creator workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.slice(0, 6).map((n) => (
            <button
              key={n.name}
              title={n.name}
              className={page === n.name ? "active" : ""}
              onClick={() => {
                setPage(n.name);
                setSearch("");
              }}
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Ready Packages" && review.length > 0 && (
                <span className="nav-count">{review.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">MANAGE</div>
        <nav>
          {nav.slice(6).map((n) => (
            <button
              key={n.name}
              title={n.name}
              className={page === n.name ? "active" : ""}
              onClick={() => setPage(n.name)}
            >
              <n.icon size={18} />
              {n.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="free-plan">
            <span>
              <Zap size={15} /> Free-first workspace
            </span>
            <p>Local tools. Thoughtful drafts.</p>
            <div className="usage-track">
              <i
                style={{
                  width: `${Math.max(0, ...(data?.usage.map((u) => u.percent) || []))}%`,
                }}
              />
            </div>
            <small>
              {data?.mode === "live"
                ? "Configured request limits enforced"
                : "Local templates · no API keys needed"}
            </small>
          </div>
          <button
            className="profile"
            onClick={() => setPage("Channel Settings")}
          >
            <span className="user-avatar">P</span>
            <span>
              <b>My workspace</b>
              <small>Workspace owner</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={12} /> <span>{page}</span>
          </div>
          <div className="topbar-right">
            <span className="system-state">
              <i /> {data?.mode === "live" ? "AI enabled" : "Local preview"}
            </span>
            <button
              className="icon-button"
              aria-label="View alerts"
              onClick={() => setPage("Logs & Jobs")}
            >
              <Bell size={18} />
              {data?.jobs.some((j) => j.status === "dead") && (
                <span className="notification-dot" />
              )}
            </button>
            <span className="user-avatar small">P</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CONTENT, ON COURSE</div>
              <h1>
                {overview ? "A little less hustle. A lot more reach." : page}
              </h1>
              <p>
                {overview
                  ? "Your content engine is ready. Let’s make something worth sharing."
                  : page === "Ready Packages"
                    ? "A final look before your content meets the world."
                    : page === "Trends & Ideas"
                      ? "Good content starts with a good question."
                      : page === "Content Calendar"
                        ? "A thoughtful rhythm for every platform."
                        : "Discover trends and keep your content moving."}
              </p>
            </div>
            <div className="heading-actions">
              <select
                aria-label="Channel profile"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                {data?.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Button onClick={() => setModal(true)}>
                <Plus size={16} /> Create content
              </Button>
            </div>
          </div>
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading">
              {loadFailed ? (
                <>
                  <p>We could not load the workspace. Saved content is safe.</p>
                  <Button
                    onClick={() => {
                      setLoadFailed(false);
                      load().catch(() => setLoadFailed(true));
                    }}
                  >
                    Retry loading
                  </Button>
                  <a href="/login">Sign in</a>
                </>
              ) : (
                <>
                  <Loader2 className="spin" /> Loading your workspace…
                </>
              )}
            </div>
          ) : (
            <>
              {overview && (
                <>
                  <section className="panel">
                    <div className="section-header">
                      <div>
                        <h2>Your engine at a glance</h2>
                        <p>What is ready, and what needs setup.</p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setPage("Notifications & AI")}
                      >
                        Configure engine
                      </Button>
                    </div>
                    <div className="readiness-grid">
                      {data.readiness.map((check) => (
                        <div key={check.id}>
                          <Status value={check.state} />
                          <h3>{check.label}</h3>
                          <p>{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="welcome-banner">
                    <div className="banner-icon">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <b>Big ideas. Small footprint.</b>
                      <p>
                        Research, create, download, post yourself. Your whole
                        workflow, in one place.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        setPage("Trends & Ideas");
                        if (await action("research")) await action("run");
                      }}
                    >
                      Find my next idea <ArrowRight size={16} />
                    </Button>
                    <div className="banner-decoration">✳</div>
                  </div>
                  <section className="stat-grid">
                    <Stat
                      label="Posted manually"
                      value={published.length.toString()}
                      note="Marked by you after manual posting"
                      icon={<FileText size={17} />}
                    />
                    <Stat
                      label="Content views"
                      value={views.toLocaleString("en-IN")}
                      note={
                        data.metrics.length
                          ? "Includes labeled mock analytics"
                          : "Automatic social analytics are inactive in manual mode"
                      }
                      icon={<BarChart3 size={17} />}
                    />
                    <Stat
                      label="Awaiting review"
                      value={review.length.toString().padStart(2, "0")}
                      note="Download, review and post yourself"
                      icon={<CheckCircle2 size={17} />}
                      accent
                    />
                    <Stat
                      label="Suggested posting times"
                      value={data.settings.times.length.toString()}
                      note={`${data.settings.times.join(" & ")} · ${data.settings.timezone}`}
                      icon={<CalendarDays size={17} />}
                    />
                  </section>
                  <div className="overview-grid">
                    <section className="panel chart-panel">
                      <div className="section-header">
                        <div>
                          <h2>
                            Content performance{" "}
                            <span className="subtle-badge">
                              {data.metrics.some((m) => m.mode === "mock")
                                ? "MOCK DATA"
                                : "VIEWS"}
                            </span>
                          </h2>
                          <p>A little progress, every day.</p>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => setPage("Analytics")}
                        >
                          View analytics <ArrowUpRight size={14} />
                        </Button>
                      </div>
                      <Performance metrics={data.metrics} />
                    </section>
                    <section className="panel pipeline-panel">
                      <div className="section-header">
                        <h2>Your autopilot</h2>
                        <span className="soft-tag">
                          {data.settings.paused ? "Paused" : "Ready"}
                        </span>
                      </div>
                      <div className="pipeline-row">
                        <span className="pipeline-icon">
                          <Sparkles size={17} />
                        </span>
                        <div>
                          <b>Ideas & research</b>
                          <small>
                            {posts.filter((p) => p.status === "idea").length}{" "}
                            ideas in your backlog
                          </small>
                        </div>
                        <Check size={15} />
                      </div>
                      <div className="pipeline-row">
                        <span className="pipeline-icon">
                          <Video size={17} />
                        </span>
                        <div>
                          <b>Content studio</b>
                          <small>
                            {
                              posts.filter((p) => p.status === "generating")
                                .length
                            }{" "}
                            posts being created
                          </small>
                        </div>
                        <span className="tiny-dot" />
                      </div>
                      <div className="pipeline-row">
                        <span className="pipeline-icon amber">
                          <ShieldCheck size={17} />
                        </span>
                        <div>
                          <b>Quality & approval</b>
                          <small>
                            Manual review is{" "}
                            {data.settings.autoApprove
                              ? "optional for low-risk content"
                              : "enabled"}
                          </small>
                        </div>
                        <span className="tiny-dot amber" />
                      </div>
                      <div className="pipeline-row">
                        <span className="pipeline-icon">
                          <Globe size={17} />
                        </span>
                        <div>
                          <b>Package & notify</b>
                          <small>WhatsApp reminders; you post manually</small>
                        </div>
                        <Check size={15} />
                      </div>
                      <Button
                        variant="secondary"
                        className="full"
                        disabled={busy}
                        onClick={() => action("run")}
                      >
                        {busy ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <Play size={14} />
                        )}{" "}
                        Run worker now
                      </Button>
                    </section>
                  </div>
                  <section className="content-section">
                    <div className="section-header">
                      <div>
                        <h2>
                          On the horizon{" "}
                          <span className="count-badge">{posts.length}</span>
                        </h2>
                        <p>Your next stories, taking shape.</p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => setPage("Content Calendar")}
                      >
                        Open calendar <ArrowRight size={15} />
                      </button>
                    </div>
                    {posts.length ? (
                      <div className="post-grid">
                        {posts.slice(0, 4).map(postCard)}
                      </div>
                    ) : (
                      <Empty
                        icon={<CalendarDays size={25} />}
                        title="Your next chapter starts here"
                        text="Add an idea or research a fresh batch. Your first posts will appear here."
                      >
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={async () => {
                            if (await action("research")) await action("run");
                          }}
                        >
                          <Sparkles size={15} /> Find trending topics
                        </Button>
                      </Empty>
                    )}
                  </section>
                  <div className="bottom-note">
                    <ShieldCheck size={15} /> Built for thoughtful publishing.
                    Legal content always needs a human check.
                    <span>Made for your next big idea ↗</span>
                  </div>
                </>
              )}
              {page === "Content Calendar" && (
                <section className="panel">
                  <div className="section-header">
                    <div>
                      <h2>
                        {month.toLocaleDateString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}
                      </h2>
                      <p>
                        Two daily slots · {data.settings.timezone} · up to 2
                        minutes of jitter
                      </p>
                    </div>
                    <div className="button-group">
                      <Button
                        variant="secondary"
                        aria-label="Previous month"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronLeft size={16} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setMonth(new Date())}
                      >
                        Today
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label="Next month"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronRight size={16} />
                      </Button>
                    </div>
                  </div>
                  <div className="calendar">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d) => (
                        <div className="weekday" key={d}>
                          {d}
                        </div>
                      ),
                    )}
                    {Array.from(
                      {
                        length: new Date(
                          month.getFullYear(),
                          month.getMonth(),
                          1,
                        ).getDay(),
                      },
                      (_, i) => (
                        <div
                          className="calendar-cell muted"
                          key={`blank${i}`}
                        />
                      ),
                    )}
                    {Array.from(
                      {
                        length: new Date(
                          month.getFullYear(),
                          month.getMonth() + 1,
                          0,
                        ).getDate(),
                      },
                      (_, i) => (
                        <div className="calendar-cell" key={i}>
                          <span>{i + 1}</span>
                          {posts
                            .filter((p) => {
                              if (!p.scheduled_at) return false;
                              const parts = new Intl.DateTimeFormat("en-CA", {
                                timeZone: data.settings.timezone,
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              }).format(p.scheduled_at);
                              return (
                                parts ===
                                `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
                              );
                            })
                            .map((p) => (
                              <button
                                className="calendar-post"
                                key={p.id}
                                onClick={() => setSelected(p)}
                              >
                                {p.title}
                                <small>{p.status}</small>
                              </button>
                            ))}
                        </div>
                      ),
                    )}
                  </div>
                </section>
              )}
              {page === "Ready Packages" && (
                <>
                  <div className="tabs">
                    <b>
                      Content review <span>{review.length}</span>
                    </b>
                    <span>Human judgment, always in the loop</span>
                  </div>
                  {review.length ? (
                    <div className="review-list">
                      {review.map((p) => (
                        <div className="panel review-card" key={p.id}>
                          {postCard(p)}
                          <div>
                            <h2>{p.title}</h2>
                            <p className="script-copy">
                              {parsed<Script | null>(p.script, null)?.body}
                            </p>
                            <div className="risk-note">
                              <ShieldCheck size={17} />
                              {parsed<{ warnings: string[] }>(p.checks, {
                                warnings: [],
                              }).warnings.join(" · ") ||
                                "Review script, media and source claims before posting."}
                            </div>
                            <div className="button-group">
                              <Button
                                disabled={busy || p.status !== "ready"}
                                onClick={() =>
                                  action("markPosted", { id: p.id })
                                }
                              >
                                <Check size={16} /> Mark as posted manually
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => setSelected(p)}
                              >
                                Review / edit
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() => action("reject", { id: p.id })}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={<CheckCircle2 size={28} />}
                      title="You’re all caught up"
                      text="Generated content will arrive here for your final review."
                    />
                  )}
                  <h2 className="section-title">Suggested comment replies</h2>
                  {data.comments
                    .filter((c) => c.status === "pending")
                    .map((c) => (
                      <div className="panel comment" key={c.id}>
                        <small>{c.platform}</small>
                        <p>{c.body}</p>
                        <blockquote>{c.draft}</blockquote>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            const draft = prompt(
                              "Edit suggested reply",
                              c.draft,
                            );
                            if (draft)
                              action("commentEdit", { id: c.id, draft });
                          }}
                        >
                          Edit draft
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => action("commentApprove", { id: c.id })}
                        >
                          Approve draft
                        </Button>{" "}
                        <Button
                          variant="ghost"
                          onClick={() => action("commentReject", { id: c.id })}
                        >
                          Reject
                        </Button>
                        <small>
                          Approval saves the reply for manual posting.
                        </small>
                      </div>
                    ))}
                  {!data.comments.length && (
                    <p className="muted-text">
                      No comments imported yet. Replies are never posted
                      automatically.
                    </p>
                  )}
                </>
              )}
              {page === "Trends & Ideas" && (
                <>
                  <WeeklyPlan key={brand} brandId={brand} />
                  <section className="panel">
                    <h2>Discover → create → download → WhatsApp</h2>
                    <p>
                      Discovery:{" "}
                      {data.settings.discoveryMode === "niche"
                        ? "your niche"
                        : "general trends in your selected region"}
                      . Public feeds work independently of mock generation.
                      Enable automatic creation in Channel Settings to generate
                      up to two top-ranked discovered topics daily. Finished
                      packages include posting copy and queue a WhatsApp
                      reminder.
                    </p>
                  </section>
                  <div className="section-header">
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        aria-label="Search ideas"
                        placeholder="Find an idea…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="button-group">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => action("run")}
                      >
                        <Play size={15} /> Run pending jobs
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          if (await action("research")) await action("run");
                        }}
                      >
                        <Sparkles size={15} /> Find trending topics
                      </Button>
                    </div>
                  </div>
                  {data.feedHealth && (
                    <div className="risk-note">
                      Last source check: {date(data.feedHealth.checkedAt)} ·{" "}
                      {data.feedHealth.sources
                        .map(
                          (source) =>
                            `${source.name}: ${source.status === "available" ? `${source.count} signals` : "temporarily unavailable"}`,
                        )
                        .join(" · ")}
                    </div>
                  )}
                  <section className="panel table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>CONTENT IDEA</th>
                          <th>FORMAT</th>
                          <th>LANGUAGE</th>
                          <th>STATUS</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {posts
                          .filter((p) =>
                            ["idea", "generating"].includes(p.status),
                          )
                          .map((p) => (
                            <tr key={p.id}>
                              <td>
                                <b>{p.title}</b>
                                <small>{date(p.created_at)}</small>
                                {data.ideaSources
                                  ?.filter((source) => source.postId === p.id)
                                  .map((source) => (
                                    <small key={source.postId}>
                                      {source.source} · score {source.score}{" "}
                                      {source.url && (
                                        <a
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          View source
                                        </a>
                                      )}
                                    </small>
                                  ))}
                              </td>
                              <td>{p.format}</td>
                              <td>{p.language}</td>
                              <td>
                                <Status value={p.status} />
                              </td>
                              <td>
                                <Button
                                  variant="secondary"
                                  disabled={busy || p.status !== "idea"}
                                  onClick={() =>
                                    action("generate", { id: p.id })
                                  }
                                >
                                  <Sparkles size={14} /> Generate
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!posts.some((p) => p.status === "idea") && (
                      <Empty
                        title="Space for a fresh idea"
                        text="Research ideas or add your own to get started."
                      />
                    )}
                  </section>
                </>
              )}
              {page === "Asset Library" && (
                <>
                  <div className="section-header">
                    <h2>Your media, ready to download</h2>
                    <span className="soft-tag">Local storage</span>
                  </div>
                  <div className="asset-grid">
                    {posts.flatMap((p) =>
                      parsed<Asset[]>(p.assets, []).map((a, i) => (
                        <article
                          className="panel asset-item"
                          key={`${p.id}${i}`}
                        >
                          {a.kind === "image" ? (
                            <img src={`/api/media/${a.path}`} alt={p.title} />
                          ) : a.path.endsWith(".mp4") ? (
                            <video controls src={`/api/media/${a.path}`} />
                          ) : (
                            <div className="asset-placeholder">
                              {a.kind === "audio" ? (
                                <Activity size={35} />
                              ) : (
                                <Video size={35} />
                              )}
                            </div>
                          )}
                          <h3>{p.title}</h3>
                          <small>
                            {a.kind} · {a.mock ? "Mock" : "Generated"}
                          </small>
                          <p>{a.license}</p>
                          <a
                            href={`/api/media/${a.path}`}
                            download
                            className="text-link"
                          >
                            Download asset <ArrowDown size={14} />
                          </a>
                        </article>
                      )),
                    )}
                  </div>
                  {!posts.some((p) => p.assets) && (
                    <Empty
                      icon={<FolderOpen size={28} />}
                      title="Your studio is a blank canvas"
                      text="Generate your first post to fill your library."
                    />
                  )}
                </>
              )}
              {page === "Analytics" && (
                <>
                  <div className="risk-note">
                    <BarChart3 size={18} /> Mock analytics are synthetic.
                    YouTube uses daily reports; Instagram uses observed deltas.
                    Unsupported Facebook metrics require a manual import.
                  </div>
                  <section className="stat-grid">
                    <Stat
                      label="Total views"
                      value={views.toLocaleString()}
                      note="Daily snapshots; avoid summing repeated lifetime totals"
                      icon={<BarChart3 size={17} />}
                    />
                    <Stat
                      label="Likes"
                      value={data.metrics
                        .reduce((n, m) => n + m.likes, 0)
                        .toLocaleString()}
                      note="Across collected metrics"
                      icon={<Activity size={17} />}
                    />
                    <Stat
                      label="Shares"
                      value={data.metrics
                        .reduce((n, m) => n + m.shares, 0)
                        .toString()}
                      note="Ideas that travel further"
                      icon={<ArrowUpRight size={17} />}
                    />
                    <Stat
                      label="Watch time"
                      value={`${Math.round(data.metrics.reduce((n, m) => n + m.watch_seconds, 0) / 60)}m`}
                      note="Collected watch seconds"
                      icon={<Clock size={17} />}
                    />
                  </section>
                  <section className="panel">
                    <div className="section-header">
                      <h2>Views over time</h2>
                      <Button
                        variant="secondary"
                        onClick={() => action("optimize")}
                      >
                        Apply best posting times
                      </Button>
                      <span className="subtle-badge">
                        {data.metrics.some((m) => m.mode === "mock")
                          ? "MOCK DATA"
                          : "COLLECTED DATA"}
                      </span>
                    </div>
                    <Performance metrics={data.metrics} />
                  </section>
                  <section className="panel table-panel section-spaced">
                    <div className="section-header">
                      <h2>What’s resonating</h2>
                      <p>Top and bottom results feed future script prompts.</p>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>CONTENT</th>
                          <th>PLATFORM</th>
                          <th>VIEWS</th>
                          <th>LIKES</th>
                          <th>DATA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.metrics]
                          .sort((a, b) => b.views - a.views)
                          .map((m) => (
                            <tr key={m.id}>
                              <td>{m.title}</td>
                              <td>
                                <Platform name={m.platform} /> {m.platform}
                              </td>
                              <td>{m.views.toLocaleString()}</td>
                              <td>{m.likes}</td>
                              <td>
                                <Status value={m.mode} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="panel section-spaced">
                    <div className="section-header">
                      <h2>Free-tier usage</h2>
                      <small>
                        Provider limits reset in UTC; content generation uses
                        your channel timezone
                      </small>
                    </div>
                    {data.usage.length ? (
                      data.usage.map((u) => (
                        <div className="quota-row" key={u.provider}>
                          <span>{u.provider}</span>
                          <div className="usage-track">
                            <i style={{ width: `${u.percent}%` }} />
                          </div>
                          <b>{u.percent}%</b>
                          <small>
                            {u.units} / {u.limit}
                          </small>
                        </div>
                      ))
                    ) : (
                      <p className="muted-text">
                        No external provider requests today. Local templates and
                        mock providers cost no API credits.
                      </p>
                    )}
                  </section>
                </>
              )}
              {page === "Content Studio" && (
                <ContentStudio key={brand} brandId={brand} onSaved={load} />
              )}
              {page === "Notifications & AI" && (
                <>
                  <NotificationConfig setup={data.whatsapp} onSaved={load} />
                  <ConnectionConfig
                    mode={data.mode}
                    publishingEnabled={false}
                    publicMediaURL=""
                    onSaved={load}
                  />
                </>
              )}
              {page === "Channel Settings" && settings && (
                <form
                  className="panel settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action("settings", { settings });
                  }}
                >
                  <div className="section-header">
                    <div>
                      <h2>Your channel, your rules</h2>
                      <p>Keep every post sounding like you.</p>
                    </div>
                    <Button disabled={busy} type="submit">
                      Save changes
                    </Button>
                  </div>
                  <label>
                    Voice examples
                    <textarea
                      rows={4}
                      maxLength={5000}
                      value={settings.voiceExamples || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          voiceExamples: e.target.value,
                        })
                      }
                      placeholder="Paste examples of how you write. These guide style, not facts."
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Trend region
                      <select
                        value={settings.discoveryRegion || "IN"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            discoveryRegion: e.target.value,
                          })
                        }
                      >
                        {[
                          ["IN", "India"],
                          ["US", "United States"],
                          ["GB", "United Kingdom"],
                          ["CA", "Canada"],
                          ["AU", "Australia"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Discover topics
                      <select
                        value={settings.discoveryMode || "trending"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            discoveryMode: e.target.value as
                              "trending" | "niche",
                          })
                        }
                      >
                        <option value="trending">
                          General trending topics
                        </option>
                        <option value="niche">Focus on my niche</option>
                      </select>
                    </label>
                    <label>
                      Automatically create content from discovered ideas
                      <input
                        type="checkbox"
                        checked={settings.autoGenerate || false}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            autoGenerate: e.target.checked,
                          })
                        }
                      />
                      Up to two per day. Approval settings control scheduling.
                    </label>
                    <label>
                      Niche
                      <textarea
                        value={settings.niche}
                        onChange={(e) =>
                          setSettings({ ...settings, niche: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tone
                      <textarea
                        value={settings.tone}
                        onChange={(e) =>
                          setSettings({ ...settings, tone: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Languages
                      <select
                        multiple
                        value={settings.languages}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            languages: Array.from(e.target.selectedOptions).map(
                              (o) => o.value,
                            ),
                          })
                        }
                      >
                        {["English", "Hindi", "Marathi"].map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Font family
                      <input
                        value={settings.font || "sans-serif"}
                        onChange={(e) =>
                          setSettings({ ...settings, font: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Brand logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const form = new FormData();
                          form.append("brandId", brand);
                          form.append("file", file);
                          const r = await fetch("/api/brand-logo", {
                            method: "POST",
                            body: form,
                          });
                          const j = await r.json();
                          if (!r.ok) setNotice(j.error);
                          else {
                            await load();
                            setNotice("Logo saved for future assets.");
                          }
                        }}
                      />
                    </label>
                    <label>
                      English voice
                      <input
                        value={settings.voice}
                        onChange={(e) =>
                          setSettings({ ...settings, voice: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Hindi voice
                      <input
                        value={settings.hindiVoice || "hi-IN-SwaraNeural"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            hindiVoice: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Marathi voice
                      <input
                        value={settings.marathiVoice || "mr-IN-AarohiNeural"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            marathiVoice: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Timezone
                      <input
                        value={settings.timezone}
                        onChange={(e) =>
                          setSettings({ ...settings, timezone: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Suggested manual posting times
                      <div className="button-group">
                        {settings.times.map((t, i) => (
                          <input
                            key={i}
                            type="time"
                            value={t}
                            onChange={(e) => {
                              const times = [...settings.times];
                              times[i] = e.target.value;
                              setSettings({ ...settings, times });
                            }}
                          />
                        ))}
                      </div>
                    </label>
                    <label>
                      Brand color
                      <input
                        type="color"
                        value={settings.color}
                        onChange={(e) =>
                          setSettings({ ...settings, color: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Daily generation cap
                      <input
                        type="number"
                        min="1"
                        max="2"
                        value={settings.dailyLimit}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            dailyLimit: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="wide">
                      Caption / end-card disclaimer
                      <input
                        value={settings.disclaimer}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            disclaimer: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="wide">
                      Banned phrases (comma separated)
                      <input
                        value={settings.bannedWords.join(", ")}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            bannedWords: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.paused}
                      onChange={(e) =>
                        setSettings({ ...settings, paused: e.target.checked })
                      }
                    />
                    <span>
                      <b>Pause content generation</b>
                      <small>Queued jobs remain in the database.</small>
                    </span>
                  </label>
                </form>
              )}
              {page === "Logs & Jobs" && (
                <>
                  <div className="section-header">
                    <h2>Jobs that keep things moving</h2>
                    <Button disabled={busy} onClick={() => action("run")}>
                      <Play size={15} /> Run worker
                    </Button>
                  </div>
                  <section className="panel table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>STAGE</th>
                          <th>STATUS</th>
                          <th>ATTEMPTS</th>
                          <th>RUN AT</th>
                          <th>DETAIL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.jobs.map((j) => (
                          <tr key={j.id}>
                            <td>
                              <b>{j.stage}</b>
                              <small>{j.id.slice(0, 8)}</small>
                            </td>
                            <td>
                              <Status value={j.status} />
                            </td>
                            <td>{j.attempts} / 3</td>
                            <td>{date(j.run_at)}</td>
                            <td>
                              {j.error && (
                                <small className="error-text">{j.error}</small>
                              )}
                              {["dead", "blocked"].includes(j.status) && (
                                <Button
                                  variant="secondary"
                                  onClick={() => action("retry", { id: j.id })}
                                >
                                  Retry
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.jobs.length && (
                      <Empty
                        title="All quiet here"
                        text="Jobs appear when you research or generate content."
                      />
                    )}
                  </section>
                  <section className="panel section-spaced">
                    <h2>Activity log</h2>
                    <div className="log-list">
                      {data.logs.map((l) => (
                        <div key={l.id}>
                          <Status value={l.level} />
                          <b>{l.event}</b>
                          <span>{date(l.created_at)}</span>
                          <small>{l.detail}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <div className="modal-overlay">
          <form
            className="modal"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await action("create", { title, format, language })) {
                setModal(false);
                setTitle("");
                setPage("Trends & Ideas");
              }
            }}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              onClick={() => setModal(false)}
            >
              <X size={20} />
            </button>
            <span className="modal-icon">
              <Sparkles size={25} />
            </span>
            <h2>Make room for a good idea.</h2>
            <p>Add your idea, then let the studio take it from here.</p>
            <label>
              What’s the story?
              <input
                autoFocus
                required
                minLength={4}
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. What to check before signing a rental agreement"
              />
            </label>
            <div className="form-grid">
              <label>
                Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="reel">Reel / YouTube Short</option>
                  <option value="carousel">Carousel</option>
                  <option value="image">Single image</option>
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
            <Button disabled={busy} className="full">
              Add to backlog <ArrowRight size={15} />
            </Button>
          </form>
        </div>
      )}
      {selected && (
        <PostDetail
          post={selected}
          connections={data?.connections || []}
          close={() => setSelected(null)}
          busy={busy}
          action={action}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`stat-card ${accent ? "accent" : ""}`}>
      <div>
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon || <Sparkles size={25} />}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Performance({ metrics }: { metrics: Metric[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 6 + i);
      return d.toISOString().slice(0, 10);
    }),
    values = days.map((day) =>
      metrics.filter((m) => m.day === day).reduce((n, m) => n + m.views, 0),
    ),
    max = Math.max(...values, 1);
  return (
    <div className="performance">
      <div className="chart-summary">
        <strong>
          {metrics.reduce((n, m) => n + m.views, 0).toLocaleString("en-IN")}
        </strong>
        <span>collected views</span>
        <span className="legend">
          <i /> Views
        </span>
      </div>
      <div className="chart-wrap">
        <div className="chart-y">
          <span>{max.toLocaleString()}</span>
          <span>{Math.round(max * 0.5).toLocaleString()}</span>
          <span>0</span>
        </div>
        <div className="chart-plot">
          <div className="grid-lines">
            <i />
            <i />
            <i />
          </div>
          <svg
            viewBox="0 0 600 140"
            preserveAspectRatio="none"
            role="img"
            aria-label="Views across the last seven days"
          >
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#8a7ae9" stopOpacity=".2" />
                <stop offset="1" stopColor="#8a7ae9" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`M 0 140 ${values.map((v, i) => `L ${i * 100} ${130 - (v / max) * 115}`).join(" ")} L 600 140 Z`}
              fill="url(#area)"
            />
            <polyline
              points={values
                .map((v, i) => `${i * 100},${130 - (v / max) * 115}`)
                .join(" ")}
              fill="none"
              stroke="#8070df"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {values.map((v, i) => (
              <circle
                key={i}
                cx={i * 100}
                cy={130 - (v / max) * 115}
                r="3"
                fill="#8070df"
              />
            ))}
          </svg>
          <div className="chart-x">
            {days.map((d) => (
              <span key={d}>
                {new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
                  weekday: "short",
                })}
              </span>
            ))}
          </div>
        </div>
      </div>
      {!metrics.length && (
        <small className="chart-empty">
          Your first published post starts the story.
        </small>
      )}
    </div>
  );
}
function PostDetail({
  post,
  connections,
  close,
  busy,
  action,
}: {
  post: Post;
  connections: { platform: string; mode: string }[];
  close: () => void;
  busy: boolean;
  action: (a: string, e?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [script, setScript] = useState(
    parsed<Script | null>(post.script, null),
  );
  const a = parsed<Asset[]>(post.assets, []),
    q = parsed<{ failures: string[]; warnings: string[] }>(post.checks, {
      failures: [],
      warnings: [],
    });
  return (
    <div className="modal-overlay">
      <section className="modal detail-modal">
        <button className="modal-close" onClick={close} aria-label="Close">
          <X size={20} />
        </button>
        <Status value={post.status} />
        <h2>{post.title}</h2>
        {script && a.length > 0 && (
          <section className="panel">
            <h3>Your manual posting package</h3>
            <p>
              Includes media, caption, hashtags, YouTube title and description,
              sources and license notes. Review factual claims and preview
              warnings before posting.
            </p>
            <a className="text-link" href={`/api/package/${post.id}`} download>
              Download complete package (.zip)
            </a>
            <p role="status">
              WhatsApp:{" "}
              {post.notification?.detail ||
                "No alert sent for this package yet."}
            </p>
            {post.status === "ready" && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => action("notifyReady", { id: post.id })}
              >
                Send / retry WhatsApp alert
              </Button>
            )}
          </section>
        )}

        {a.find(
          (asset) => asset.kind === "video" && asset.path.endsWith(".mp4"),
        ) && (
          <video
            className="reel-preview"
            controls
            preload="metadata"
            playsInline
            src={`/api/media/${a.find((asset) => asset.kind === "video" && asset.path.endsWith(".mp4"))!.path}`}
          />
        )}
        {script?.generationNote && (
          <p className="risk-note">{script.generationNote}</p>
        )}
        {post.editorial && (
          <details className="editorial-details">
            <summary>Editorial review · {post.editorial.status}</summary>
            <p>Local writing heuristics; not a reach prediction.</p>
            <pre>{JSON.stringify(post.editorial.tools, null, 2)}</pre>
            {post.editorial.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </details>
        )}
        {a[0] && (
          <img
            className="detail-preview"
            src={`/api/media/${a[0].path}`}
            alt={post.title}
          />
        )}
        <div className="detail-fields">
          {script ? (
            (
              [
                "hook",
                "body",
                "cta",
                "caption",
                "seoTitle",
                "description",
              ] as const
            ).map((key) => (
              <label key={key}>
                {key}
                <textarea
                  disabled={!["review", "ready"].includes(post.status)}
                  value={script[key]}
                  onChange={(e) =>
                    setScript({ ...script, [key]: e.target.value })
                  }
                />
              </label>
            ))
          ) : (
            <p>Generate this idea to create the script and assets.</p>
          )}
          {script && ["review", "ready"].includes(post.status) && (
            <>
              <label>
                On-screen text and carousel slides
                <textarea
                  value={script.onScreen.join("\n")}
                  onChange={(e) =>
                    setScript({
                      ...script,
                      onScreen: e.target.value
                        .split("\n")
                        .filter((line) => line.trim()),
                    })
                  }
                />
              </label>
              <label>
                Hashtags · separate with commas
                <input
                  value={script.hashtags.join(", ")}
                  onChange={(e) =>
                    setScript({
                      ...script,
                      hashtags: e.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                Target length (15–45 seconds)
                <input
                  type="number"
                  min={15}
                  max={45}
                  value={script.duration}
                  onChange={(e) =>
                    setScript({ ...script, duration: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
          {script?.sources.length ? (
            <div>
              <h3>Sources to verify</h3>
              {script.sources
                .filter((url) => /^https?:\/\//.test(url))
                .map((url) => (
                  <a
                    className="text-link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={url}
                  >
                    Open research source <ExternalLink size={13} />
                  </a>
                ))}
            </div>
          ) : null}
          {q.failures.concat(q.warnings).map((s, i) => (
            <p className="risk-note" key={i}>
              {s}
            </p>
          ))}
          {script && ["review", "ready"].includes(post.status) && (
            <div className="button-group">
              <Button
                disabled={busy}
                onClick={async () => {
                  if (await action("edit", { id: post.id, script })) close();
                }}
              >
                Save edits
              </Button>
              <Button
                variant="secondary"
                disabled={busy || post.status !== "ready"}
                onClick={async () => {
                  if (await action("markPosted", { id: post.id })) close();
                }}
              >
                Mark as posted manually
              </Button>
            </div>
          )}
          {a.map((asset, i) => (
            <a
              className="text-link"
              key={i}
              href={`/api/media/${asset.path}`}
              download
            >
              Download {asset.kind} {i + 1} <ArrowDown size={14} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
