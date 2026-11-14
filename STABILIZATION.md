# GrowthX — Baseline Stabilization

- **Date:** 2026-11-14
- **Branch:** `stabilize/baseline` (from `main` @ `4870c48`)
- **Status:** uncommitted, awaiting approval
- **Inputs:** `AUDIT.md` (architecture), `BASELINE.md` (failures F-1 to F-5). Both are unchanged.

This was a stabilization pass. There are no new features, no architectural changes, no dependency changes (lockfile untouched), no paid API calls, and no deployment. Nothing was committed or pushed.

---

## 1. Files changed and why

### Application code (3 files, minimal)

| File | Change | Why |
|---|---|---|
| `web/lib/server/agents/runtime.ts` | `searchEvents(filters)` becomes `searchEvents(filters, now())` in the `searchCatalog` tool | **F-3.** Catalog search used the wall clock instead of the runtime's injected clock, so agent runs were not reproducible. Production behavior is unchanged, because the default `now` is still `new Date()`. |
| `web/lib/server/agents/dispatcher.ts` | Adds an optional `now?: () => Date` to `AgentDispatcherOptions` and passes it through to `executeClaimedTask` | The dispatcher dropped the clock, so callers could not inject it. Callers that omit it (the worker and Cloudflare alarm) behave as before. |
| `web/cloudflare/catalog.ts` | `searchEvents` accepts an optional `now`. It is used only for the reported `evaluatedAt`; the snapshot timestamp remains the fallback. | Required for the Cloudflare build to typecheck once the runtime passes a clock. Verified: with the new runtime and the original `catalog.ts`, `tsc -p cloudflare/tsconfig.json` fails (exit 2); with the change it passes (exit 0). Search results are unaffected. |
| `web/components/taste/taste-workspace.tsx` | The one-time "restore saved brief from the first server snapshot" `useEffect` + `useRef` becomes a guarded state update during render (`useState` flag) | **F-4,** the `react-hooks/set-state-in-effect` lint error. Same trigger (first non-null `team.workspace`), same single execution, same state updates. Exercised by the new browser smoke test (reload, then the plan view restores from the server). |

### Tests and CI

| File | Change | Why |
|---|---|---|
| `web/tests/agent-runtime.test.ts` | (1) A file-level temporary SQLite workspace (`EVENT_GTM_WORKSPACE_PATH` set to a `mkdtemp` directory and removed in an `after` hook) with a seeded demo workspace, used by the `claim()` fixture. (2) A fixed clock (`2026-09-28T12:00Z`, the fixture date) for the two catalog-backed Scout tests. (3) The Producer fixture adds the now-required `experience` and `coverImageUrl` fields. | **F-1, F-2, F-3, B-04.** The tests no longer write to `web/.data/workspace.sqlite`. All original assertions are unchanged; none were removed, loosened, or skipped. |
| `web/tests/browser-smoke.mjs` | Rewritten for the live UI (`TasteWorkspace`). The old script targeted unrouted legacy components. | **F-5.** It covers: welcome screen; website step with the Taste-not-configured error surfaced; brief submission persisted server-side; "not configured" team message; reload restoring the plan from the server; `/demo` seeded plan; event-details dialog; team-activity dialog; mobile layout without horizontal overflow. It fails on any page error or any unexpected same-origin 4xx/5xx; the only allow-listed failure is `502 POST /api/brand` without `TASTE_API_KEY`. It saves screenshots to the ignored `test-results/`. |
| `.github/workflows/ci.yml` (new) | Ubuntu 24.04, Node 24.22.2, pnpm via corepack (`packageManager` pin), `pnpm install --frozen-lockfile`, catalog gunzip plus SHA-256 check, then typecheck, lint, test, build, **browser smoke** (production server started on a fresh `$RUNNER_TEMP` workspace DB with `EVENT_GTM_DEMO_ENABLED=true`, using the runner's preinstalled Google Chrome; screenshots uploaded as an artifact, server log printed on failure), and a final catalog-unchanged check | Minimal, deterministic CI. It uses no secrets or credentials and calls no paid APIs. Read-only `contents` permission. |
| `STABILIZATION.md` (new) | This report | — |

---

## 2. Before / after results

All results below were run on this machine (Node 24.22.2, pnpm 11.8.0 via corepack).

| Check | Before (`BASELINE.md`) | After |
|---|---|---|
| `pnpm test` | 32/44 pass, **12 fail** (all in `agent-runtime.test.ts`) | **44/44 pass**, 0 skipped. Ran 3 times, all green. |
| `agent-runtime.test.ts` | 4/16 | **16/16** |
| `pnpm typecheck` | Pass | **Pass** |
| `pnpm lint` | **1 error**, 12 warnings | **0 errors**, 12 warnings |
| `pnpm build` | Pass | **Pass** |
| `pnpm test:browser` | **Fail** (stale selectors) | **Pass.** Twice, each against a fresh workspace DB and a production server with no credentials. |
| Cloudflare typecheck (`tsc -p cloudflare/tsconfig.json`, after generating the ignored catalog snapshot) | Not runnable without the generated snapshot | **Pass** |
| Tests write the dev DB (`web/.data/workspace.sqlite`) | Yes | **No.** SHA-256 and mtime identical before and after the full suite. No temporary directories remain. |
| Research catalog SHA-256 | `8e197337…b850cc` | Unchanged after all runs |
| CI simulation (clean copy of the working tree with no ignored artifacts; every workflow step run in order) | — | **All steps exit 0**, including server start and browser smoke on a fresh temporary DB. Tests 44/44; no `web/.data` created. |

---

## 3. Remaining warnings and known limitations

**Lint warnings (12, unchanged, documented)**
- 9 × `@next/next/no-img-element` in `components/taste/*`.
- 3 × `no-unused-vars`:
  - `_options` in `cloudflare/dns.ts:2`
  - `budgetOnly` in `taste-workspace.tsx:128`
  - `actionLabel` in `team-results.tsx:24`

**Limitations**
- **Live LLM agent execution is not verified.** All 16 agent tests use scripted model clients. They verify runtime mechanics: tool allowlists, validation, caps, hand-offs, staging, stale handling. They do not verify Anthropic or Brainbase behavior or output quality.
- **CI has not yet run on GitHub.** It was simulated locally on a clean copy. The `next build` step downloads Google Fonts (`next/font/google`), so the runner needs public network access, which is normally available on GitHub-hosted runners.
- **CI uses Node 24.22.2** (approved; the version verified here). `engines` allows Node 22.13 and later, and the docs mention 22.13, but Node 22 is untested.
- **Browser smoke needs a fresh workspace DB.** CI provides one. Run locally, on a reused DB `/` opens straight into the saved plan, so step 1 fails by design.
- **The new smoke test dropped coverage of legacy, unrouted UI** (catalog list, dossier, comparison, export). Those components still exist and are now untested in a browser.
- **The Cloudflare runtime was only typechecked.** It was not built with Vite or run with wrangler.
- **Unchanged from `AUDIT.md`:**
  - The local mode shares one `demo-workspace` across sessions.
  - The catalog is stale (the Cloudflare export run here produced only **68** upcoming records).
  - Cover generation and sharing exist only in the Cloudflare runtime.
- `web/.data/workspace.sqlite` (gitignored) remains from the earlier baseline run. Delete it if it is not wanted.

---

## 4. Readiness for MVP implementation

**Yes, as a test-verified baseline.** Typecheck, lint, all 44 unit and integration tests, the production build, and a live-UI browser smoke test are green. They are reproducible and independent of the clock and credentials. CI enforces all five once committed.

This baseline verifies the agent runtime's *deterministic mechanics*, not live agent quality. One credentialed, cost-approved live run is still recommended before evaluation work depends on real model behavior. The architectural decisions in `AUDIT.md` §16–17 (runtime target, persistence, agent topology) remain open and are outside this task.

---

## 5. Decisions requiring human approval

1. **Commit and PR.** Approve committing these changes on `stabilize/baseline`, and decide whether `AUDIT.md` and `BASELINE.md` should be committed alongside them.
2. ~~CI Node version~~: resolved, 24.22.2.
3. ~~Browser smoke in CI~~: resolved, added to the CI job.
4. **Live LLM verification.** Authorize, or decline, a single paid run with real credentials to move live agent behavior from "documented" to "verified".
5. **Legacy UI components.** Decide whether the unrouted research-workspace components (and their CSS) are kept or removed. This affects test coverage and is out of scope here.
