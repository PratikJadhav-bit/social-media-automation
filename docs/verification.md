# Functional verification — 10 October 2026

Result: local mock workflow passes verification. Live publishing and actual audio/video generation are not verified or active.

## Checks completed

- Browser walkthrough of all nine dashboard sections; calendar navigation, idea search, approval editor, settings fields, connection state, media library, analytics and job logs responded.
- 22 automated tests passed across 8 suites. API integration exercises creation, generation, review, edited-asset regeneration, scheduling, mock publishing, media responses and idempotency on an isolated test database.
- Tests cover scheduler IST/DST behavior, quality failures, encryption tampering, quota/storage caps, dead letters, paused jobs, cross-origin write rejection, production sign-in enforcement and tenant ownership.
- HTTP mock tests verify Instagram, Facebook Reel and YouTube upload request sequences. These do not verify platform credentials or remote behavior.
- Current default brand: 28 posts, 2 awaiting review, no failed jobs, no connected social platforms.
- All five generated asset URLs returned HTTP 200 with expected content types. The video preview is JSON, not MP4; the mock voiceover is silence.
- TypeScript passed. The production build is checked separately; consult its latest output after any edit.

## Issues corrected during this check

1. Brand selector was hidden on narrow screens; it now remains available, with navigation tooltips.
2. Image/carousel posts were queued for YouTube. Scheduling and completion now use compatible platforms: Reels target all three; images/carousels target Instagram and Facebook. Existing incompatible publish jobs are skipped.
3. Media routes could resolve traversal segments outside the authorized post directory. Routes now enforce exactly two safe path segments; regression tests reject traversal and nested paths.
4. Paused jobs consumed retries and could become dead letters. Paused generation/publish jobs now remain pending without spending attempts; resuming permits processing. Scoped worker passes only reclaim leases belonging to their brand.

## Remaining limits

No live Instagram, Facebook or YouTube account is connected. Paid APIs are not required. Real generation requires free/local provider configuration plus Python/FFmpeg; Docker and FFmpeg were not available for runtime validation here. Some platform analytics, multi-Page selection and Postgres remain manual/unimplemented as detailed in README. A successful Next.js build is not evidence of these integrations working.
