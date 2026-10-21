# Architecture and assumptions

The requested zero-paid-API replacement stack takes precedence. Next.js App Router owns dashboard, API and NextAuth credentials login. Drizzle models describe the SQLite schema; the job repository uses parameterized SQL because job claims need atomic UPDATE RETURNING. WAL and a shared local volume support the web and worker on one host. SQLite is not a distributed database: do not mount it across multiple machines.

`src/app` routes and authentication → `src/lib` application services → provider interfaces → SQLite and local files. `src/components/ui` contains the shadcn-style Radix/Slot button; dashboard components use Tailwind plus an explicit theme. `scripts` contains the worker loop and CPU media tool. `tests` cover each milestone and a mock end-to-end pipeline.

Tables: tenants → brands → posts → publications → daily metrics. Brands also own platform connections, comments, jobs and logs. Usage guards are shared across the installation because provider keys are installation-wide. Unique `(post,platform)`, `(publication,day)` and job idempotency keys prevent local duplicate work. Assets and license records currently live as typed JSON on posts. Trends cache is a TTL table. Tokens are AES-256-GCM ciphertext; secrets come from environment variables.

Job stages: research → script → assets → quality → manual approval → publish per platform → analytics. The worker atomically claims due jobs, renews its lease, retries failures three times and retains dead letters. Telegram is optional. Manual approval checks current script and licenses again. Auto-approval never bypasses factual risk or mock asset warnings. Brand pause applies to generation and publishing.

Assumptions: one installation owner initially; tenant identifiers are supplied by the signed session, never from API callers. New brands belong to that owner. You can extend identity provisioning for other tenants without changing content ownership. Media is private; Meta requires separate explicitly public media hosting. Demo analytics are labeled synthetic. A mock video is a JSON storyboard unless FFmpeg is enabled; it is never silently uploaded as a real video.

Exactly-once publishing cannot be guaranteed across local and remote transactions. The adapter persists remote handles and blocks automatic retries after uncertain live results. Reconcile against the platform before resetting the publication. This trades unattended recovery for duplicate prevention.

The default install has no paid services. Optional accounts and quotas do not create an unconditional zero-cost guarantee: use unbilled accounts, provider caps, local storage, and available free compute. Electricity, bandwidth and a domain are outside the software's API budget.
