# GrowthX — Verified Technical Baseline

- **Date:** 2026-11-14
- **Commit:** `4870c48` (unchanged)
- **Branch:** `verify/baseline`, created from `main` with no commits
- **Companion document:** `AUDIT.md` (not repeated here)

Everything below was **executed** during this verification unless it is marked otherwise. No application code, configuration, lockfile, or `AUDIT.md` was modified. No paid API was called and nothing was deployed.

**Labels used**

| Label | Meaning |
|---|---|
| ✅ Verified | Executed and observed |
| 🟡 Mock-verified | Passes only with a scripted (fake) model |
| ❌ Fails | Executed and failed |
| ⚪ Unverified | Not executable without credentials or providers |

---

## 1. Environment and dependency setup

| Item | Value / Result |
|---|---|
| OS / Node | Linux; Node **v24.22.2** (satisfies `engines: >=22.13.0`; docs target 22.13+) |
| Package manager | `packageManager: pnpm@11.8.0`. pnpm was not installed globally; I used **`corepack pnpm`** (corepack 0.36.0 fetched exactly 11.8.0). |
| Install | `cd web && corepack pnpm install --frozen-lockfile`: **success**, 25.9 s. Lockfile unchanged. Build scripts ran for esbuild, sharp, unrs-resolver, and workerd (allowed in `pnpm-workspace.yaml`). |
| Resolved key versions | next 16.2.6, react 19.2.4, typescript 5.7.3, eslint 9.39.5, tsx 4.23.15, playwright 1.58.2, wrangler 4.142.0 |
| Catalog | `gunzip -k event-gtm-2026-09-28/scale-expansion-20260928/dataset.sqlite.gz` (documented procedure; output is gitignored). SHA-256 `8e197337…b850cc` **before and after all checks**, identical to `docs/growthx-transfer-verification-20260928.md`, so the catalog stayed immutable. |
| Credentials | None present. These variables are unset: `ANTHROPIC_*`, `TASTE_API_KEY`, `BRAINBASE_API_KEY`, `SESSION_SECRET`. No `.env.local` exists. |
| Browser | `/usr/bin/google-chrome` available (Playwright `channel: 'chrome'`) |

The following ignored artifacts were created: `dataset.sqlite`, `web/node_modules/`, `web/.next/`, `web/public/maplibre/`, `web/tsconfig.tsbuildinfo`, and `web/.data/workspace.sqlite`. The last one was written by `pnpm test` (see B-04). `git status` shows only `AUDIT.md` and `BASELINE.md` as untracked.

---

## 2. Commands executed and exact results

All commands ran from `web/` unless noted. `pnpm` means `corepack pnpm`.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | 0 | Installed; no lockfile drift |
| 2 | `pnpm test` (`node --import tsx --test tests/*.test.ts`) | **1** | **44 tests: 32 pass, 12 fail**, 0 skipped, ~5.5 s |
| 3 | `pnpm typecheck` (`tsc --noEmit`) | 0 | Clean |
| 4 | `pnpm lint` (`eslint .`) | **1** | **1 error, 12 warnings** |
| 5 | `pnpm build` (`next build --webpack`) | 0 | Compiled in 7.0 s; build-time TypeScript pass; 20 routes (3 static, 17 dynamic) |
| 6 | `EVENT_GTM_DEMO_ENABLED=true EVENT_GTM_WORKSPACE_PATH=<scratch> pnpm start` plus curl endpoint smoke (§5) | — | Server healthy; results in §5 |
| 7 | `pnpm worker --once` (no credentials, same scratch DB) | 1 | `ANTHROPIC_API_KEY is required to run agent tasks.` No task was claimed (`attempts` stayed 0). This is correct fail-fast behavior. |
| 8 | `node tests/browser-smoke.mjs` (local server) | **1** | `locator('.event-row') … Timeout 30000ms exceeded` |
| 9 | Ad-hoc Playwright check of the live UI (`/`, `/demo`), script kept outside the repo | 0 | Both pages render; 0 page errors; 0 failed same-origin responses |
| 10 | Diagnostic: copy of `tests/agent-runtime.test.ts` in the scratchpad, with the fixture `workspaceId` set to a seeded workspace (one-line change, repo untouched) | 1 | **16 tests: 14 pass, 2 fail** (isolates root causes; §4) |

**Lint findings**
- **Error:** `components/taste/taste-workspace.tsx:137` violates `react-hooks/set-state-in-effect`.
- **Warnings:**
  - 8 × `@next/next/no-img-element` in `components/taste/*`
  - Unused variables: `budgetOnly` (`taste-workspace.tsx:128`), `actionLabel` (`team-results.tsx:24`), `_options` (`cloudflare/dns.ts:2`)

The docs reported 2 lint errors in other files (`map-first-workspace.tsx`, `onboarding.tsx`). Those no longer appear; the current single error is in the live UI.

---

## 3. Passing checks

- **Typecheck:** clean (both standalone and inside `next build`).
- **Production build:** succeeds.
- **Tests that pass in full:**

  | File | Result |
  |---|---|
  | `workspace.test.ts` | 7/7 |
  | `dataset.test.ts` | 9/9 |
  | `evidence.test.ts` | 8/8 |
  | `opportunity-state.test.ts` | 3/3 |
  | `export.test.ts` | 1/1 |

- **Tests that pass in `agent-runtime.test.ts`:** 4/16
  - Tool allowlist
  - Stale-result handling
  - Anthropic config validation
  - Header and credential redaction
- **HTTP smoke:** every local endpoint behaved as designed (§5).

---

## 4. Failing checks and root-cause evidence

### F-1: 12/16 `agent-runtime.test.ts` failures. Test-fixture drift (reproducible, deterministic)

- All 12 throw `WorkspaceNotFound: Demo workspace was not found`. The call chain is `runtime.ts:646 runModel → readCompanyBrand → requireWorkspace (repository.ts:134)`.
- The fixture claim uses `workspaceId: 'workspace_test'` (`tests/agent-runtime.test.ts:54`). That workspace is never inserted. `runModel` now unconditionally reads the brand from the database (Taste integration added later).
- **Production impact:** none observed. Real claims always reference an existing workspace. This is a **test defect**, but it currently masks the coverage for the runtime's orchestration logic.
- With the workspace seeded (diagnostic #10), 14/16 pass. The remaining 2 failures are F-2 and F-3.

### F-2: "Producer can draft a private conditional concept…". Test fixture out of date with the tool schema

- The fixture's `proposeDraftRevision` input omits `experience` and `coverImageUrl`. `roles.ts:151` now lists both as required.
- Schema validation rejects the call, so no draft is staged. The runtime's post-condition (`runtime.ts:792`) then fails the task with "There is enough evidence to prepare a private conditional concept; stage a draft revision."
- The schema and validator behave as intended.

### F-3: "Scout country aliases are normalized…". Real non-determinism defect (wall-clock dependency)

- The `searchCatalog` tool calls `searchEvents(filters)` **without** the runtime's injected `now` (`runtime.ts:487`; `dataset-repository.ts:160` accepts `now?`). It therefore evaluates "upcoming" against the real clock.
- The expected result, *FLOCK – The Autonomous-Ops Summit*, starts **2026-10-14**. That is now in the past, so 0 results are returned and the test expects 1.
- **This affects production behavior and reproducibility.** Agent runs and future evaluation runs cannot be pinned to a fixed date, which contradicts the `AGENTS.md` guidance to inject fixed clocks.

### F-4: `pnpm lint`, 1 error (pre-existing)

- `react-hooks/set-state-in-effect` at `components/taste/taste-workspace.tsx:137`. This is a code-quality rule, not a runtime failure.
- The build does not run ESLint, so the build still passes.

### F-5: `tests/browser-smoke.mjs` is stale (pre-existing)

- The script waits for `.event-row` and the heading "Four roles, one shared plan." These exist only in `components/events/event-list.tsx` and `components/agent-console.tsx`, which **no route renders** (`app/page.tsx` renders `TasteWorkspace`).
- The script tests a UI that no longer ships, so **there is no automated browser coverage of the live UI.**

**Environmental failures:** none. Every failure above reproduces deterministically on this machine. F-3 is date-dependent by nature.

---

## 5. Verified vs. unverified functionality

| Capability | Status | Evidence |
|---|---|---|
| Catalog search / filters / paging | ✅ Verified | `dataset.test.ts` 9/9; `GET /api/events` 200; FTS operator-safety test passes |
| Catalog detail and evidence | ✅ Verified | `GET /api/events/<id>` 200 (15 evidence rows); unknown ID returns 404 JSON |
| Catalog health / read-only mode | ✅ Verified | `GET /api/health` 200, `catalogMode: read-only`; SHA-256 unchanged after all runs |
| Temporal rules, evidence links, map points, scoring helpers | ✅ Verified | `evidence.test.ts` 8/8, `opportunity-state.test.ts` 3/3 |
| SQLite workspace persistence and migrations (fresh DB) | ✅ Verified | Server created a new DB at a scratch path and all writes succeeded; `workspace.test.ts` uses temp DBs |
| Demo session (cookie → workspace) | ✅ Verified | `POST /api/demo/session` 200; `/api/workspace` returns 401 without the cookie and 200 with it |
| Brief versioning (optimistic concurrency) | ✅ Verified | First POST → v1 (201); repeat with `expectedVersion:0` → **409**; malformed brief → 400 |
| Draft versioning and human edits | ✅ Verified | `PATCH /api/drafts/:id` v1 → v2 (200); stale `expectedVersion` → **409** |
| Run creation and idempotency | ✅ Verified | `POST /api/runs` → 202 with a queued Lead task; the same `idempotencyKey` returns the same run |
| Simulated inbound reply, dedupe, task creation | ✅ Verified | First → 202 and a Partnerships task; duplicate `messageId` → `duplicate:true`, no task; `simulated:false` → 400 |
| Task leasing, retries, expiry recovery, atomic completion, stale results | ✅ Verified (tests) | `workspace.test.ts` 7/7 (lease expiry, terminal failure, sibling cancel, stale result) |
| Worker credential guard | ✅ Verified | Exits 1 before claiming; tasks stay `queued`, attempts 0 |
| Agent runtime: allowlist, validation, call caps, repair, hand-offs, evidence rules | 🟡 Mock-verified, **only after fixture correction outside the repo** | As committed: 4/16 pass. Seeded diagnostic: 14/16 |
| Agent orchestration (Lead → Producer / Scout / Partnerships → Lead) | 🟡 Mock-verified (seeded diagnostic) | Hand-off tests pass with a scripted model; no live run |
| **Live LLM agent behavior** (Anthropic or Brainbase) | ⚪ Unverified | No credentials; no paid calls made. Live runs are documented only (`docs/cloudflare-brainbase.md`) |
| Taste brand extraction / event design | ⚪ Unverified | Without a key: `POST /api/brand` → 502 "Taste is not configured on the server." (fails safely, no outbound call) |
| Frontend ↔ backend integration (live UI) | ✅ Verified (render and read path) | `/` and `/demo` render with 0 page errors and 0 failed responses; persisted state appears (8 and 11 plan cards; the draft edit "Smoke edited title" shows in the UI) |
| Map rendering in live UI | ⚪ Unverified | Map area rendered empty in a headless screenshot; not investigated further |
| Cover generation, preview sharing | ❌ Not available locally | `POST /api/event-cover` and `/api/previews/:id/share` → **404** under Next.js (Cloudflare-only routes, as `AUDIT.md` predicted) |
| Workspace isolation (local) | ❌ Confirmed absent | A second, independent session cookie saw the **same** `demo-workspace` (brief v2, 8 opportunities) |
| Cloudflare Worker runtime | ⚪ Unverified | Not built or run (`build:cloudflare`, `wrangler dev` not executed) |

**Additional observation (informational):** `POST /api/runs` with `Origin: https://evil.example` returned 202. Only `/api/brand` and `/api/event-design` check the Origin header in Next.js. The `SameSite=Strict` session cookie limits real cross-site browser exposure.

---

## 6. Existing infrastructure safe to reuse

These are verified by execution:
- **Read-only catalog adapter** and temporal and evidence helpers (`lib/server/dataset-repository.ts`, `lib/temporal/*`, `lib/evidence/*`).
- **Workspace repository:** sessions, brief and draft versioning, idempotent runs, simulated-reply dedupe, task lease, retry, and recovery, and atomic completion with stale-result protection (`lib/server/workspace/*`).
- **API route layer** for workspace, briefs, runs, drafts, inbound replies, and events.
- **Worker entry point** (`scripts/run-agent-worker.ts`) and its configuration guard.
- **Build and typecheck pipeline.**

Reuse with care (mock-verified only):
- **Agent runtime** (`lib/server/agents/runtime.ts`, `roles.ts`). Its logic passes 14/16 once the fixture is valid, but it needs F-1 to F-3 resolved before its tests can serve as a regression net.

---

## 7. Blockers requiring correction before implementation

| ID | Blocker | Why it blocks | Evidence |
|---|---|---|---|
| B-01 | Agent-runtime test suite is red (F-1, F-2) | Agent work, the core of the MVP, has no working regression safety net | §4 |
| B-02 | Catalog search ignores the injected clock (F-3) | Agent behavior is non-deterministic over time; evaluation runs (8 cases × 3 runs × 3 configs) cannot be reproduced | `runtime.ts:487` |
| B-03 | No browser coverage of the live UI (F-5) | UI changes cannot be validated automatically | §4 |
| B-04 | Tests write to the default dev DB | `pnpm test` created `web/.data/workspace.sqlite`, because `agent-runtime.test.ts` does not set `EVENT_GTM_WORKSPACE_PATH`; this risks test/dev state crossover | Observed artifact |
| B-05 | Lint is red (F-4) | Blocks any "lint must pass" gate, such as CI | §2 |
| B-06 | Shared local workspace | Concurrent evaluation or demo sessions collide | §5 |

B-06 is an architectural item already covered in `AUDIT.md` (R-04). It is listed here because it was confirmed by execution.

---

## 8. Remaining environment / credential requirements

| Purpose | Requirement |
|---|---|
| Live agent runs (local worker) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_WORKSPACE_ID`, **or** `BRAINBASE_API_KEY` |
| Brand extraction / event design | `TASTE_API_KEY` (paid; optional for the MVP) |
| Cloudflare runtime | `SESSION_SECRET`, `BRAINBASE_API_KEY`, `TASTE_API_KEY` (Wrangler secrets) and a Cloudflare account. Not exercised. |
| Production-mode local server | `EVENT_GTM_DEMO_ENABLED=true` (demo sessions are disabled by default when `NODE_ENV=production`; `lib/server/workspace/session.ts:6-9`) |
| Tooling | pnpm 11.8.0 (via corepack), Google Chrome for Playwright, and the decompressed catalog for `dataset.test.ts` and the agent tests |

---

## 9. Recommended minimum stabilization work

This is the smallest set of changes, in order, to reach a fully green and trustworthy baseline. None of it was done here.

1. **Fix the agent-runtime test fixtures (F-1, F-2).**
   - Seed a workspace and isolate `EVENT_GTM_WORKSPACE_PATH` to a temporary DB.
   - Update the Producer fixture to include `experience` and `coverImageUrl`.
   - Expected result: 15/16 pass.
2. **Pass the runtime `now` into `searchEvents` in `searchCatalog` (F-3)**, then pin the Scout test to a fixed clock. Expected result: 16/16 pass, and agent runs become reproducible.
3. **Resolve the single lint error (F-4).** The 12 warnings can wait.
4. **Replace or retarget `tests/browser-smoke.mjs` (F-5)** at the live `TasteWorkspace` (`/`, `/demo`). The ad-hoc check used here (render, no page errors, no failed responses) is a minimal template.
5. **Add one CI workflow:** install with the frozen lockfile, decompress the catalog, then run typecheck, lint, test, and build. This keeps the baseline from regressing during agent-driven development.
6. **Optionally, run one credentialed live agent run** (cost-approved) to move "live LLM behavior" from documented to verified before evaluation work begins.

**Verdict.**
- The persistence, task-queue, API, catalog, and build layers have a **verified baseline** and are ready to build on.
- The agent runtime is **not yet a verified baseline**. Its committed tests are red, and live model behavior has never been observed in this environment.
- Items 1–3 above (small, test-focused, plus one clock-injection fix) should come before MVP feature work begins.
