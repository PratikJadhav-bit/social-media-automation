> **Current workflow:** manual posting. The app prepares complete media/copy ZIP packages and queues WhatsApp content-ready alerts. Automatic publishing controls are removed. See [manual posting and WhatsApp setup](docs/manual-posting.md) for the current behavior; older publishing sections describe retained legacy adapters.

# Social Media Autopilot

A free-first content workspace for independent Indian creators. Next.js 16, TypeScript, Tailwind, Radix UI, NextAuth, Drizzle/SQLite, an atomic database job queue, Sharp, and optional local Python/FFmpeg media processing. No Redis, paid API or cloud account is required for the local mock workflow.

## Run locally

Requires Node 24 LTS and npm. From this directory:

```sh
npm ci
npm install-scripts approve better-sqlite3 esbuild
cp .env.example .env
npm run dev
```

On PowerShell use `Copy-Item .env.example .env`. Open http://localhost:3000. Development without `ADMIN_EMAIL` has a local owner session; bind to localhost and do not expose this mode. For production set `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, `AUTH_SECRET`, and `TOKEN_ENCRYPTION_KEY`. Generate each secret separately with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The encryption key must be exactly 64 hex characters. Never commit `.env` or `data`.

Research ideas → Run worker now → Generate an idea → Run worker → Approval Queue → Review / edit → Approve & schedule. Connect mock accounts for all three platforms before scheduled jobs execute. Leave a worker running with `npm run worker`; a bounded `npm run cron` processes due jobs and exits. The UI worker button is useful for development. Default settings create at most two posts/day per brand and reuse them across platforms. Manual review is enabled. Legal content always requires human review.

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests use separate SQLite databases and media directories under ignored `data`. The M5 integration test runs idea → script → image → quality → approval → three mock publishers → metrics and verifies duplicate prevention. Mock videos are JSON storyboards and mock voiceovers are silent WAVs, clearly labeled; no real accounts are affected.

## Real free providers

Set `PROVIDER_MODE=live` only after configuring a free provider. Gemini → Groq → explicitly configured Ollama fallback uses a common structured script contract with timeouts, retries and daily guards. Models and account limits change; set the model and conservative daily limits from your provider console. Never activate paid billing to make a quota error disappear. Usage counts include retry attempts. Successful API responses are schema validated; exhaustion leaves a retryable job rather than quietly fabricating publishable content.

Install Python 3.11+, FFmpeg (including libass), and fonts supporting Devanagari. `pip install -r requirements.txt`, then set `RENDER_VIDEO=true`. Edge TTS generates Indian English/Hindi voiceovers; an installed Piper binary plus `PIPER_MODEL` supplies the fallback. faster-whisper runs locally on CPU and produces word-timed subtitles. FFmpeg renders 1080×1920 H.264/AAC with burned captions. The default video uses original branded imagery and no music, avoiding third-party license ambiguity. Models download on first use; disk, CPU, bandwidth and electricity are your local resources.

Only use permitted APIs, licensed media and original templates. Keep the license and attribution with each asset. AI-assisted disclosure is appended in Meta captions; YouTube uploads set `containsSyntheticMedia`. API-level Meta disclosure availability varies, so check the platform UI and current API before publication. A disclaimer is not factual verification: independently verify legal claims, state-specific procedures and source URLs during review.

## Social access and OAuth

Live publishing needs `PUBLISH_MODE=live`, real media and OAuth credentials. Set `APP_URL` to your HTTPS application URL. Register `${APP_URL}/api/connect/callback` as the redirect URI in both developer consoles. Tokens are encrypted at rest; Google refresh tokens refresh on expiry. Expired/revoked Meta tokens require reconnecting. The first release fails explicitly when multiple eligible Meta Pages need account selection rather than connecting an arbitrary Page.

**Instagram / Facebook:** create a Meta developer app, add Facebook Login, Instagram API with Facebook Login and Pages access. Use an Instagram Business/Creator account linked to a Facebook Page. Grant the listed scopes in `src/app/api/connect/[platform]/route.ts`; permissions depend on API version/use case. Development works only for app roles/testers. To serve outside users, complete Meta App Review, provide review screencasts/privacy policy/data deletion instructions, and complete business verification if requested. [Meta Instagram publishing docs](https://developers.facebook.com/docs/instagram-platform/content-publishing/) and [Pages API docs](https://developers.facebook.com/docs/pages-api/). Set `META_API_VERSION` to a version your approved app supports.

Meta servers must fetch media from public HTTPS URLs. `/api/media` is authenticated; it is intentionally unsuitable as `PUBLIC_MEDIA_URL` in production. Set `PUBLIC_MEDIA_DIR` to a dedicated public media directory served by your HTTPS proxy, or explicitly select the optional R2 adapter, and configure its base `PUBLIC_MEDIA_URL`. No credentials should appear in media URLs. Instagram supports image/carousel/Reels; Facebook supports images, multi-photo posts and the Reel start/upload/finish protocol. These live request sequences have HTTP mock tests, not account-level certification. Image posts are 1080×1350 JPEGs; Reels are 1080×1920 MP4s when local rendering is enabled.

**YouTube:** create a Google Cloud project, enable YouTube Data API v3 and YouTube Analytics API, create a Web OAuth client and consent screen. Add your channel owner as a test user until verification. Request upload/read/analytics scopes. Quota accounting varies by method and project; configure a conservative upload guard using your console, not an assumed universal allocation. Uploads use a resumable session, retain its remote handle, and default to **private** for inspection. Unverified projects may be restricted to private uploads; public publication requires the relevant API compliance audit and OAuth verification. See [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) and [quota/audit guide](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits). Public release is a manual step until your project and uploaded media have been verified.

Remote publish operations cannot participate in the SQLite transaction. A live timeout creates an **uncertain** publication. Do not blindly retry: inspect the platform, retain the remote ID and reconcile the publication first. Dead jobs remain visible in Logs & Jobs. The worker sends optional Telegram alerts only after retry exhaustion. A mock retry uses deterministic publication IDs.

## Hosting without a required subscription

**Local machine:** keep both `npm run dev` (or built `npm start`) and `npm run worker` running. Scheduled slots use the brand timezone, default Asia/Kolkata. A sleeping machine cannot publish; overdue approved jobs run after restart. Persist/backup `data` including the SQLite database using its backup API; do not copy an active WAL database alone.

**Docker / Oracle Always Free:** configure `.env`, then `docker compose up --build -d`. The app binds to host loopback; put an HTTPS reverse proxy in front of it. Both containers share a named durable volume and run as a non-root user. Ensure its ownership permits UID 1000. Use an eligible Always Free compute shape and volume allocation; avoid trial-only resources and paid account upgrades. Capacity is not guaranteed and idle instances may be reclaimed. Oracle asks for a card for identity verification and may create temporary authorization holds, as described in its [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/). ARM builds require native package wheels and have not been validated here. Back up the volume regularly. Do not scale SQLite web/worker replicas across hosts.

**System cron:** on the same durable Linux host, `*/5 * * * * cd /path/to/app && /usr/bin/npm run cron >> /path/to/worker.log 2>&1`. The lease safely handles overlapping invocations. Install Node/Python/FFmpeg once and ensure `.env` is readable only by the service user.

**GitHub Actions:** the included workflow invokes `/api/cron` on your already-running durable host, using repository secrets `APP_URL` and `CRON_SECRET`. It does not create a fresh SQLite database on an ephemeral runner. Public repositories using standard runners have free execution; private accounts have quotas. Choose no paid overages and track usage in your GitHub billing settings. Schedules can be delayed and are not a precise clock. A pure ephemeral runner with local SQLite cannot safely persist accounts/jobs; use a self-hosted runner on your local machine and run `npm run cron` instead, or the durable hosted endpoint. No tokens or database artifacts should be uploaded to Actions. [GitHub billing docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## External accounts

| Service                                                         | Required?                        | Free option and payment details                                                                                            |
| --------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| None                                                            | Local mock default               | No account or card                                                                                                         |
| Google AI Studio / Gemini                                       | Optional LLM                     | Free eligible models; no paid billing required. Verify your account/model rate limits                                      |
| Groq developer account                                          | Optional LLM fallback            | Free developer limits; do not upgrade for this setup                                                                       |
| Ollama / Piper / Whisper                                        | Optional local generation        | Open-source, no account; local hardware and model licenses apply                                                           |
| Microsoft Edge speech endpoint                                  | Optional TTS                     | edge-tts client; service availability/terms are not a guaranteed SLA; Piper fallback                                       |
| Meta developer + Facebook Page + Instagram professional account | Live publishing only             | No API subscription; permissions/review/verification required                                                              |
| Google Cloud project + YouTube channel                          | Live uploads/trends              | Free API quotas; no paid API purchase required; audits for public uploads                                                  |
| Telegram + BotFather bot                                        | Optional alerts                  | Free bot API; no card                                                                                                      |
| GitHub                                                          | Optional scheduled trigger       | Free standard public runners / private included quota; no paid overages required                                           |
| Oracle Cloud                                                    | Optional host                    | Always Free resources; card for identity verification; capacity not guaranteed                                             |
| Pexels / Pixabay                                                | Optional stock                   | Free API keys; licensing and attribution rules apply                                                                       |
| Cloudflare R2                                                   | Optional future storage adapter  | Included free usage but subscription checkout and monthly metered billing; not required and not a hard zero-cost guarantee |
| Neon / Supabase                                                 | Optional future database adapter | Free tiers available; default deployment uses SQLite and no account                                                        |

## Status and explicit fallbacks

Implemented: all nine dashboard sections, multi-brand ownership, owner credentials auth with login throttling, authenticated token encryption, SQLite schema, mock end-to-end workflow, LLM adapters, branded Sharp templates with fonts/logos, optional stock APIs and local Stable Diffusion, speech/caption/video adapters, quality checks, approval/edit/reject with asset regeneration, timezone slots with jitter, job claims/leases/retries/dead letters, daily generation/provider guards, storage caps, OAuth routes, all three publisher adapters, analytics/comment adapters, manual metric import, feedback examples, posting-time suggestions and deployment files. Local tests verify the mock workflow and selected external HTTP request contracts.

Current gaps/manual fallbacks: hosted Postgres is not implemented; use SQLite on a single durable host (setting `DATABASE_URL` fails explicitly). Facebook Insights metrics require an authenticated manual daily import because supported metrics vary by Page/API version. Instagram watch time/follows are unavailable in the current adapter; YouTube daily reports include watch time and subscriber gains, with subscriber gains retained as auxiliary cache records. Meta token expiry requires reconnecting. Multiple eligible Meta Pages need account selection, which is not implemented. Music is omitted by default; add properly licensed music manually in your editor. YouTube videos default to private pending your audit and inspection. Caption language checks are heuristics, not a reliable multilingual classifier. **Live OAuth, publisher accounts, R2, Docker, Python model downloads and actual video rendering have not been verified on this machine.** This is a runnable local implementation with explicit integration limits, not a certification that every requested production capability is complete.

## Optional local and cloud adapters

`AUTO_GENERATE=true` lets the persistent worker generate up to the brand cap each day from the idea backlog. It never bypasses manual approval. The worker researches daily and keeps up to 28 active ideas (14 days at two posts/day), rotating configured languages and formats. Curated seed topics eventually exhaust; configure public sources or add new original ideas to keep research fresh.

`ENABLE_PYTRENDS=true` and `ENABLE_EMBEDDINGS=true` activate the installed Python adapters. pytrends is an unofficial client and can be rate-limited or unavailable; public-source failures retain the editorial seed fallback. Embeddings use a local multilingual sentence-transformers model. Cached trend responses last six hours. `ENABLE_STOCK=true` uses your Pexels/Pixabay keys for backgrounds/clips, caching search results and retaining author/source/license records. Verify licenses, depicted-person permissions and attribution during approval. `IMAGE_PROVIDER=stable-diffusion` uses a locally running AUTOMATIC1111-compatible API at `STABLE_DIFFUSION_URL`; no hosted paid image API is called. Text always comes from the Sharp template.

R2 is optional and is a **metered subscription with included free allowances**, not a hard zero-cost service. Keep `STORAGE_PROVIDER=local` for the strict local-only zero-subscription setup. To explicitly opt in, set `STORAGE_PROVIDER=r2`, configure the R2 credentials, a dedicated initially empty bucket and its public base URL. The app keeps a conservative 5 GB ledger and 100 writes/day by default and fails closed at the cap. Writes from other tools, other buckets on your account, reads and provider-side charges are not controlled by this app. Do not delete the ledger/database while retaining remote files. Failed writes keep their storage reservation conservatively. See the [official SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [metered R2 setup](https://developers.cloudflare.com/r2/get-started/).

Back up SQLite consistently with `npm exec tsx -- scripts/backup.ts` (or the `backup` npm script), preserve the encryption key separately, and back up media. Restrict environment-file permissions. Configure your reverse proxy to overwrite `X-Real-IP` for login throttling and only forward known Host names. See [milestone checks](docs/milestones.md) for test coverage and verification limits.

See [architecture](docs/architecture.md) for tables, boundaries and assumptions. Never turn on unattended publishing before validating generated assets, official sources, licensing, OAuth permissions and quota settings with your own accounts.


### General trend discovery and account setup

Use **Trends & Ideas → Find trending topics** to scan public India Google Trends and Google News RSS, independently of the content provider mode. Existing editorial posts remain. Channel Settings switches between general trends and a niche, and can enable automatic creation (maximum two daily); a running worker/cron is required for unattended scans. Manual approval remains the default. Source URLs are recorded with research logs and shown beside discovered ideas. Scores are editorial heuristics, not verified traffic counts. Mock generation produces review placeholders, not finished news reports or playable videos.

All three real account connections require developer credentials: Google OAuth client ID/secret for YouTube, Meta app ID/secret for Instagram/Facebook, plus a stable 64-character hexadecimal TOKEN_ENCRYPTION_KEY. Set these in .env and restart. Register the exact callback shown on Platform Connections; use the same APP_URL hostname throughout OAuth. Google testing apps need the signing-in account listed as a test user. Instagram needs a professional account linked to a Facebook Page; Facebook publishing targets Pages. The UI now reports missing configuration and returns OAuth errors to the connection screen. Real login/publishing remains unverified without credentials.


### Integrated editorial tools (October 11, 2026)

The **Content Studio** uses the MIT-licensed Instagram, YouTube and LinkedIn repositories from Jake Schincariol, pinned in `vendor/sources.json` with their original licenses. The app runs eleven allowlisted local Python tools: hook scoring, beat timing, draft cleanup, writing-style review, Instagram caption linting, YouTube title/thumbnail checks, Instagram and YouTube outlier analysis, retention analysis, chapters, and transcript edit suggestions. All 68 hook formulas are available through the platform selector and writing briefs. The scores are heuristics, not view predictions or AI detection guarantees. Non-English scripts are preserved rather than rewritten using English-specific rules. LinkedIn output is drafting/export only; LinkedIn publishing is not implemented.

`npm run dev` provisions missing local security keys, including blank keys in a copied `.env.example`, and preserves existing configuration. If encrypted credentials already exist, setup requires the original encryption key rather than generating a replacement. Platform Connections now accepts Google/Meta OAuth credentials and optional Gemini/Groq keys; these are encrypted in SQLite and never returned through workspace APIs. Blank credential fields retain saved values. Switching the AI engine and live publishing is explicit. Do not change the encryption key after saving credentials unless you plan to reconnect. Back up that key with the database. For Google, register the exact callback URL shown and add your account as a test user when applicable. Meta account selection supports multiple eligible Pages and linked professional Instagram accounts.

Default Reel generation now renders playable 720x1280 MP4 previews using the bundled FFmpeg binary. Verified live media with real audio renders at 1080x1920. Mock narration remains silent and mock drafts remain ineligible for live publishing. Free edge-tts is available on this machine; provider or speech failures retain a clearly labelled template/silent preview instead of pretending production succeeded. The original optional FFmpeg/Whisper path remains available.

The generation action runs pending steps immediately, while `npm run worker` handles unattended processing and records a heartbeat displayed on Overview. Approval queues only selected connected compatible accounts; a single connected account can complete a post. Setup-dependent publishing jobs pause without exhausting retries, and ambiguous remote results still require reconciliation to prevent duplicate posts. Meta additionally needs exported files at a publicly accessible HTTPS media base URL; that URL can now be saved in Platform Connections. Saving a URL does not create hosting or upload assets.

Trends use public feeds independently of the AI mode, show source availability, support IN/US/GB/CA/AU region selection, deduplicate titles, and retain provenance for fact checking. General discovery no longer ranks by the channel niche. The weekly planning view respects occupied slots and does not schedule unapproved content.
