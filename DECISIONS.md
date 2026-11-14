# GrowthX — Architecture Decisions (MVP)

- **Status:** Approved by project owner; team review pending. These decisions are final for the initial MVP unless changed through team review.
- **Date:** 2026-11-14
- **Baseline:** `main` @ `64d4a8b`
- **Context:** `AUDIT.md` (what exists), `BASELINE.md` (what was verified), `STABILIZATION.md` (current green baseline).

This file records decisions, not an implementation plan. Specifications (Kiro) and code must conform to it. Changing a decision requires explicit human approval and an update to this file.

---

## Project purpose

GrowthX is a university multi-agent systems project that helps growth teams:

- research events,
- plan campaign participation,
- review materials, and
- discover repetitive workflows that can be automated with human approval.

The MVP must demonstrate four specialized LLM agents that share persistent campaign state, coordinate work, and run bounded review and revision loops. It must also include one human-approved automation, and it must be evaluated against simpler baselines.

## Architectural principles

1. **Extend what works.** Build on the verified baseline rather than replacing it:
   - the bounded tool-calling runtime;
   - the persisted task queue with leasing, retries, and recovery;
   - versioned briefs and drafts;
   - the read-only catalog.
2. **Deterministic code coordinates; LLMs reason.** Routing, permissions, limits, state transitions, and validation are ordinary code. Models provide research, planning, critique, and drafting.
3. **Evidence over assertion.** Facts cite sources. Unknowns and uncertainty stay explicit, and nothing is filled in by assumption.
4. **Humans hold authority** over event selection, disputed decisions, approvals, and anything irreversible.
5. **Untrusted input is data, never instructions.** This covers uploaded materials, web pages, replies, and model output.
6. **Reproducible and measurable.** Use injected clocks, a replaceable model client, instrumented runs, and green CI.
7. **No premature infrastructure.** Add a framework, database, or abstraction only when a demonstrated need exists.

---

## D1 — Runtime

**Decision**
- **Next.js plus the Node.js worker** (`web/app/api/**`, `web/scripts/run-agent-worker.ts`) is the primary MVP runtime.
- Reuse the existing application and task-execution infrastructure.
- The Cloudflare Worker/Durable Object implementation (`web/cloudflare/`) is **preserved but not actively maintained**.
- Hosting remains flexible.

**Reasoning**
- The two runtimes have diverged: different routes, providers, catalog search, and guards (`AUDIT.md` §04, R-03).
- Maintaining both would double the work for every feature.
- The Next.js and Node path is the one covered by tests, CI, and the browser smoke test.

**Tradeoffs**
- The deployed Cloudflare demo and its Cloudflare-only features (cover generation, share links) will fall behind.
- No hosting target is optimized for yet.

## D2 — Persistence

**Decision**
- **Retain SQLite** for the MVP, using the existing workspace database (`web/lib/server/workspace/`).
- Reuse the existing task queue, leasing, retries, idempotency, stale-result handling, and transactional completion.
- **Introduce campaign-level isolation.** Writes are scoped to a campaign. The Workflow Agent may perform authorized, read-only analysis of historical campaigns in the same workspace or team. Access across workspaces is prohibited.
- Extend the schema for campaign history, feedback, approvals, and workflow instructions.
- No PostgreSQL migration and no new database abstraction layer.

**Reasoning**
- The SQLite repository and queue are verified (`BASELINE.md` §5; `workspace.test.ts`).
- Migrating to PostgreSQL would require an async rewrite of every repository function (`AUDIT.md` R-05) without adding MVP value.
- Isolation is required because local sessions currently share one `demo-workspace` (`BASELINE.md` B-06).

**Tradeoffs**
- A single-writer, single-host deployment.
- The synchronous repository API is kept.
- The migration tooling is weak (`AUDIT.md` R-15) and must handle the new schema versions carefully.

## D3 — Multi-agent architecture

**Decision.** The full GrowthX product consists of exactly four specialized LLM agents:

| Agent | Responsibility |
|---|---|
| **Research Agent** | Event discovery, comparison, evidence, missing information |
| **Planning Agent** | Participation plans, invitations, tasks, revisions |
| **Workflow Agent** | Recurring-task detection and automation proposals |
| **Review Agent** | Evidence validation, constraints, unresolved issues, correction requests |

- Agents are coordinated by a **deterministic application-level orchestrator**, not by a fifth LLM agent.
- Reuse the existing bounded tool-using runtime (`web/lib/server/agents/runtime.ts`) and the persisted task queue.
- Adapt the existing roles where appropriate:
  - **Scout:** research.
  - **Producer:** planning and drafting.
  - **Lead:** prioritization, with its routing logic moving to the orchestrator.
  - **Partnerships:** outreach drafting and reply interpretation.
- Support meaningful delegation, shared state, and **bounded** review and revision loops.
- Evaluation configurations (D5) may use different agent topologies, including the single-agent baseline. These exist for comparison only and do not change the product architecture.
- **No LangGraph, CrewAI, or other orchestration framework** without a demonstrated need.

**Reasoning**
- The existing runtime already provides per-role tool allowlists, schema validation, evidence-ID checks, staged writes, and limits.
- A deterministic orchestrator keeps routing auditable and reproducible.
- It also makes the evaluation baselines (D5) cleanly configurable.

**Tradeoffs**
- Less emergent model-driven coordination.
- The current Lead-driven delegation and its hard-coded hand-offs must be reworked.
- Existing role prompts are hackathon-specific and need rewriting (`AUDIT.md` R-08).

## D4 — Workflow learning and human approval

**Decision**
- Persist historical campaign materials, feedback, revisions, and source references.
- The Workflow Agent identifies recurring work and produces **evidence-backed** automation proposals. Insufficient evidence or uncertainty is marked explicitly.
- **Human approval is required before any automation executes.**
- Approved instructions are stored **versioned**, and can be edited, disabled, or revoked.
- An approved instruction may be workspace-level. It can then be **explicitly enabled** for authorized future campaigns in the same workspace. Enabling an instruction grants it to those campaigns only and gives agents no unrestricted access across campaigns.
- **The MVP implements exactly one automation:** consolidating invitation feedback into a revision brief.
- Conflicting comments and unresolved human decisions are preserved, not resolved silently.
- Uploaded materials are untrusted data.
- Out of scope: **no** autonomous email sending, publishing, payments, or model training.
- "Learning" means storing and reusing human-approved instructions.

**Reasoning**
- None of this exists today (`AUDIT.md` R-01).
- One narrow automation is enough to demonstrate the full loop: detect, propose with evidence, approve, execute, revise.
- Keeping it to one automation limits scope and risk.

**Tradeoffs**
- A deliberately narrow automation surface.
- Executing approved instructions widens the prompt-injection surface, so the executor's tools must stay tightly scoped.

## D5 — Model provider and evaluation

**Decision**
- Use the existing **direct Anthropic integration** (`web/lib/server/agents/model-client.ts`).
- Keep the replaceable `AgentModelClient` interface to limit vendor lock-in.
- Instrument model usage, tool calls, execution time, and errors.
- **Three configurations:**
  1. Single-agent baseline.
  2. Multi-agent system with workflow suggestions disabled.
  3. Full four-agent GrowthX system.
- **Eight cases × three repetitions × three configurations = 72 runs.**
- All runs use the same model, the same inputs, and comparable total token and tool budgets.
- **Metrics:** recurring-task detection, unsupported suggestions, missed constraints, unresolved decisions, reviewer corrections, runtime, and model usage.
- Cases are **independently labeled**, with human review.
- **No paid evaluation runs without separate authorization.**

**Reasoning**
- The direct client is small and testable, and is already the local default.
- Token usage is currently discarded (`AUDIT.md` R-02), so instrumentation must come before evaluation.
- Equal budgets make the configuration comparison fair.

**Tradeoffs**
- Brainbase, used only by the unmaintained Cloudflare runtime, drops out of the main path.
- Evaluation needs a real model budget and human labeling effort.

---

## Implementation constraints (binding for Kiro and all contributors)

**Runtime and storage**
- Build MVP features on the Next.js and Node worker runtime only.
- Do not delete `web/cloudflare/`, but do not require Cloudflare parity.
- Use SQLite through the existing repository and migration pattern. Add schema through new, versioned migrations.
- Never write to the research catalog. It stays read-only, and its SHA-256 check in CI must keep passing.

**Agents and orchestration**
- The full product has exactly four LLM agents plus a deterministic orchestrator. Do not add an LLM "manager" agent. Evaluation-only configurations (D5) may use other topologies, such as the single-agent baseline.
- Reuse `runtime.ts` conventions:
  - per-agent tool allowlists;
  - JSON-schema-validated tool inputs and final results;
  - staged writes committed atomically through the repository;
  - explicit call, round, and task limits.
- Every review and revision loop has a hard iteration bound and a visible terminal state.

**Isolation and approval**
- **Writes** are scoped to a single campaign. No agent writes to another campaign's state.
- **Reads:** the Workflow Agent may perform authorized, read-only analysis of historical campaigns in the same workspace or team. All other agents read only their own campaign.
- **No access across workspaces.** No agent or route may read or write another workspace's or team's data.
- Tests must cover campaign write isolation, the authorized read-only Workflow access, and rejection of cross-workspace access.
- An automation runs only against a specific approved instruction version. Disabled or revoked instructions never execute.
- A workspace-level approved instruction runs in a campaign only after it has been explicitly enabled for that campaign by an authorized user. Enabling it does not widen any agent's read or write scope beyond the isolation rules above.
- Approvals, edits, and revocations are recorded.

**Content and safety**
- Preserve provenance:
  - Every factual claim references evidence or a source document.
  - Assumptions are kept separate from facts.
  - Conflicting feedback is stored as a conflict, not merged away.
- Treat uploaded or ingested content, fetched pages, replies, and model output as untrusted data.
- No tool may send messages, publish, purchase, or train models.

**Models and evaluation**
- All model access goes through `AgentModelClient`. Record per-call usage, latency, tool calls, and errors.
- Tests use scripted model clients, injected clocks (`now`), and temporary SQLite databases. Never use the developer database or the wall clock.
- Do not claim that live agent behavior is verified by scripted-model tests.
- No paid API calls, evaluation runs, or deployments without explicit authorization.

**Engineering hygiene**
- CI must stay green: typecheck, lint with 0 errors, tests, build, and browser smoke.
- No dependency upgrades or new frameworks without approval.

---

## Open questions for the specification phase

These are not decided here and must be resolved in specs or by the team.

1. **Campaign model:**
   - What fields make up a campaign (goals, audience, budget units and currency, dates, constraints)?
   - How does it relate to the existing workspace and brief versions?
   - Can one user have several campaigns?
2. **Ingestion:**
   - Which formats are supported for historical materials and organizer replies, and how are they uploaded?
   - Where does sample or seed data come from? The repository contains none.
3. **Feedback and comment model:**
   - How are comments linked to documents and revisions?
   - How are conflicts represented?
   - What counts as "unresolved"?
4. **Recurrence detection:** what evidence threshold justifies proposing an automation, and how is "insufficient evidence" expressed?
5. **Approval UX and records:**
   - Who approves?
   - What exactly is approved (instruction text, scope, version)?
   - How are edit, disable, and revoke surfaced?
6. **Agent mapping details:**
   - How is Partnerships' functionality split between the Planning and Workflow agents?
   - Which existing Lead prioritization logic becomes deterministic orchestrator code, and which becomes Research or Planning prompts?
7. **Review loop policy:**
   - Maximum review iterations.
   - What the Review Agent may block or only flag.
   - How correction requests are recorded and counted.
8. **Orchestrator topology per evaluation configuration:**
   - How the single-agent baseline is defined (one agent with the union of tools?).
   - How "comparable budgets" are enforced.
9. **Evaluation cases and labels:**
   - Who authors and labels the 8 cases?
   - What is the scoring rubric for each metric?
   - Will an LLM judge assist human review?
10. **Model selection:** which Anthropic model ID and token limits to use? The current output cap of 2,400 tokens caused truncation (`AUDIT.md` R-14).
11. **Event data freshness:** the catalog cutoff is 2026-09-28 (`AUDIT.md` R-06). Will the MVP refresh data, use a fixed evaluation date, or both?
12. **Scope of existing extras:** will Taste brand extraction, preview pages, the prepared Taste Labs demo, and the unrouted legacy UI be kept, hidden, or removed?
13. **Authentication:** is campaign isolation without user accounts sufficient for the course MVP?
