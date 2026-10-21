# Milestone verification

M1 — Next.js app, SQLite/Drizzle models, owner credentials authentication, tenant/brand boundaries, authenticated token encryption, provider contracts and mocks. Defaults and tamper detection are tested.

M2 — Cached source research, duplicate-title checks, optional CPU embeddings, structured LLM scripts with free-provider fallback, Sharp branded images, mock/local speech and video adapters. Language/schema validation and duplicate checks are tested. Local Python/FFmpeg and external AI services require runtime setup; those live calls were not executed.

M3 — Manual review/edit/reject, asset regeneration after edits, timezone-aware twice-daily scheduling with jitter, generation caps, job claims/leases/retries/dead letters. IST rollover, DST, quality failures, quota enforcement, backlog size and dead letters are tested.

M4 — Mock publishers and OAuth routes, Instagram container/poll/publish, Facebook image/multi-photo/Reel requests, YouTube resumable private uploads and disclosure. Tests mock HTTP and verify request sequences/disclosure; real OAuth apps, approvals, media hosting and publishing remain unverified.

M5 — Daily metrics, feedback examples, comment suggestions with approval/edit/reject, optimizer gated on distinct live samples, quota dashboard and all nine dashboard sections. Mock end-to-end integration checks three platform publications, daily analytics, and retry idempotency.

The suite currently contains 22 tests. TypeScript and the Next.js production build passed during implementation. The latest check outputs, not these notes, are authoritative after edits. Docker and CPU media execution are unverified on this Windows host (FFmpeg and Docker were not found). Postgres is still an optional extension point, not an implemented runtime backend. The R2 adapter exists but is not verified against an account. The manual fallback for unsupported/changed platform analytics is an authenticated metrics import action; missing metrics are not fabricated.
