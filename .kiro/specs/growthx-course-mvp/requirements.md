# Requirements Document

## Introduction

GrowthX is an existing Next.js, Node.js, and SQLite research workspace for event go-to-market planning. This feature transforms it into a university multi-agent systems MVP. The MVP has four specialized LLM agents (Research, Planning, Workflow, Review) coordinated by a deterministic Orchestrator. It supports event campaign planning, historical feedback analysis, evidence-backed workflow discovery, one human-approved automation (invitation feedback consolidation), and reproducible evaluation against a single-agent baseline and a multi-agent baseline.

The authoritative inputs are `DECISIONS.md` (D1 to D5) and the approved decisions B1 to B7 supplied by the project owner. `AUDIT.md`, `BASELINE.md`, and `STABILIZATION.md` describe the existing system and are not repeated here.

**Existing baseline to preserve (main at 5887345):** CI is green with 44 tests, typecheck, lint with 0 errors, build, and browser smoke. The read-only catalog, task queue with leasing and retries, versioned briefs and drafts, and the bounded tool-using agent runtime already exist and are extended, not replaced.

**Existing role mapping:** Scout becomes Research. Producer becomes Planning. Lead's routing becomes the Orchestrator and its prioritization moves to Research and Planning. Partnerships' outreach drafting moves to Planning, and its reply interpretation moves to Workflow and Review as assigned in Requirement 6.

**Honest verification status:** Tests that use scripted model clients verify deterministic mechanics only (routing, limits, validation, persistence, authorization). They do not verify live LLM behavior or output quality. Live behavior is verified only by the separately authorized evaluation in Requirement 17.

**Open items** (not decided by D1 to D5 or B1 to B7) are listed at the end of this document and are deferred to the design phase or to the team.

## Glossary

- **GrowthX**: The existing web application and worker that this feature extends.
- **Workspace**: The unit of session ownership and data isolation. One Workspace contains multiple Campaigns.
- **Session**: A browser session bound to exactly one Workspace, identified by a token stored only in signed or hashed form, with an expiry time. A Session is valid while it is unexpired and its token matches the stored value; otherwise it is invalid. The Session holder acts as the Approver.
- **Approver**: The holder of a valid Session of a Workspace. No user accounts exist in the MVP.
- **Campaign**: A planning unit inside a Workspace with required free-text goals and target audience, and optional budget, dates, location, constraints, and preferences.
- **Not_Provided**: The recorded state of an optional Campaign field that the Approver did not supply. Not_Provided is distinct from an empty value and from any default value.
- **Brief**: A versioned record of a Campaign's definition. Each Brief version belongs to exactly one Campaign.
- **Orchestrator**: The deterministic application-level component that routes tasks among agents, enforces permissions and limits, and manages state transitions. The Orchestrator is code and not an LLM.
- **Research_Agent**: The LLM agent responsible for event discovery, comparison, evidence, and identifying missing information.
- **Planning_Agent**: The LLM agent responsible for participation plans, invitations, tasks, and revisions.
- **Workflow_Agent**: The LLM agent responsible for recurring-task detection, automation proposals, and executing approved automations.
- **Review_Agent**: The LLM agent responsible for validating outputs, raising findings, and requesting corrections.
- **Agent_Runtime**: The existing bounded tool-using runtime (`web/lib/server/agents/runtime.ts`) with per-agent tool allowlists, schema validation, and staged writes.
- **Model_Client**: The replaceable `AgentModelClient` interface through which all model access occurs.
- **Catalog**: The existing frozen, versioned, read-only SQLite event dataset.
- **Evidence_Record**: A Catalog evidence row or a saved Source_Record that supports a factual claim.
- **Source_Record**: A saved, identifiable document, pasted text, or organizer reply stored in the Workspace database.
- **Historical_Material**: A Source_Record from a previous campaign (invitation drafts, plans, review comments, notes).
- **Organizer_Reply**: A Source_Record containing a real reply from an event organizer, entered manually or uploaded.
- **Feedback_Comment**: A reviewer comment linked to a Source_Record, a Draft revision, and a Campaign.
- **Draft_Revision**: One version of an invitation draft. Original drafts and all prior revisions are retained.
- **Review_Round**: One distinct review of a draft or plan, identified by a Review_Round identifier within a Campaign.
- **Conflict_Record**: A stored record that two or more Feedback_Comments contradict each other.
- **Unresolved_Decision**: A stored record of a decision that requires a human and has not been made.
- **Recurring_Pattern**: A candidate task supported by at least two Independent_Evidence examples that represent the same recurring activity (same task type and intent), each backed by a cited Source_Record. Two examples are a minimum threshold and not proof of recurrence.
- **Independent_Evidence**: A supporting example backed by its own saved Source_Record. Independence is counted on exactly one basis at a time: distinct Review_Rounds, or distinct Campaigns. Each Source_Record counts at most once, and duplicate comments within one Review_Round count as one example.
- **Same_Activity**: The condition that all counted examples of a candidate carry the same task-type label and a cited excerpt that shows the same intent.
- **Human_Only_Action**: An action reserved for the Approver through a Session: approving, editing, enabling, disabling, restoring, or revoking an Instruction_Version, withdrawing a Campaign_Enablement, recording a decision on an Unresolved_Decision, and resolving a Conflict_Record.
- **Stale_Result**: The result of an agent task whose Brief version is no longer current, or whose execution authorization was lost before commit.
- **Reference_Date**: The date used to judge whether an event is upcoming: the actual current date for interactive requests, and the Evaluation_Clock for Evaluation_Harness runs.
- **Date_Unknown**: The label for an event whose start and end dates are absent or cannot be parsed.
- **Unavailable_Usage**: A distinct marker (`unavailable`) recorded in place of a token count that the provider did not report. Unavailable_Usage is never equal to zero.
- **Not_Applicable (N/A)**: The reported state of a metric that a Configuration lacks the capability to produce. N/A is distinct from a measured value of zero.
- **Output_Status**: The review state of a reviewed output: `in_review`, `PASSED`, or `needs_human_review`.
- **Pattern_Status**: One of `proposable` or `insufficient_evidence`.
- **Automation_Proposal**: An evidence-backed proposal to automate a Recurring_Pattern.
- **Workflow_Instruction**: A human-approvable instruction defining the feedback consolidation automation, held as a chain of Instruction_Versions.
- **Instruction_Version**: One version of a Workflow_Instruction. Its content (instruction text, scope, and automation type) is immutable after creation. Its lifecycle state is held separately as Instruction_Status.
- **Approval_Record**: An append-only record of an approve, edit, disable, restore, revoke, enable, or withdraw_enablement action, with action, timestamp, Instruction_Version, Campaign where applicable, and Session identifier.
- **Instruction_Status**: The approval lifecycle state of one Instruction_Version, derived from its Approval_Records and not part of its immutable content. One of `proposed`, `approved`, `disabled`, or `revoked`.
- **Campaign_Enablement**: An explicit, recorded act by the Approver that allows one Instruction_Version to execute in one Campaign. A Campaign_Enablement binds one Instruction_Version and one Campaign and can be withdrawn.
- **Revision_Brief**: The structured output of the feedback consolidation automation (see Requirement 11).
- **Review_Finding**: A persisted result of the Review_Agent with a severity, supporting evidence, responsible agent, and resolution status.
- **Blocking_Finding**: A Review_Finding of severity `blocking`.
- **Warning_Finding**: A Review_Finding of severity `warning`.
- **Correction_Request**: A persisted request from the Review_Agent that a responsible agent fix a Review_Finding.
- **Correction_Attempt**: One response by a responsible agent to a Correction_Request, followed by a re-review.
- **needs_human_review**: The terminal state of a reviewed output whose Blocking_Findings remain after two Correction_Attempts.
- **Evaluation_Harness**: The tooling that runs evaluation cases under the three configurations.
- **Evaluation_Case**: One independently labeled scenario with fixed inputs and expected labels.
- **Configuration**: One of C1 (single-agent baseline), C2 (multi-agent with workflow suggestions disabled), or C3 (full four-agent system).
- **Evaluation_Clock**: The fixed date 2026-09-28 used for every evaluation run.
- **Usage_Record**: A persisted record of one model call with tokens (numeric or Unavailable_Usage), latency, tool calls, and error status.
- **Scripted_Model_Client**: A deterministic Model_Client used in tests that returns predefined responses.

## Requirements

### Requirement 1: Preserve Existing Baseline and Runtime

**User Story:** As a project maintainer, I want the MVP to extend the verified Next.js, Node.js, and SQLite implementation, so that working functionality and CI stay intact.

#### Acceptance Criteria

1. THE GrowthX SHALL implement all MVP features in the Next.js application (`web/app/api/**`) and the Node.js worker (`web/scripts/run-agent-worker.ts`).
2. THE GrowthX SHALL persist MVP state in SQLite through the existing workspace repository and versioned migration pattern.
3. WHEN a new schema element is required, THE GrowthX SHALL add the element through a new versioned migration that leaves existing migrations unmodified.
4. WHEN the new migrations run against a Workspace database created by main at 5887345, THE GrowthX SHALL retain all existing briefs, drafts, runs, tasks, and timeline events.
5. THE GrowthX SHALL keep the Cloudflare implementation in `web/cloudflare/` in the repository without requiring feature parity.
6. THE GrowthX SHALL pass the existing test suite of 44 tests, typecheck, lint with 0 errors, build, and browser smoke after each MVP change set, except for tests that Requirement 3 or Requirement 4 intentionally supersede.
7. WHEN a change set supersedes an existing test, THE GrowthX SHALL include the replacement coverage for that test in the same change set.
8. THE GrowthX SHALL add no new framework or dependency without explicit human approval.

### Requirement 2: Campaign Model

**User Story:** As a growth team member, I want several campaigns in one workspace with structured budgets and flexible goals, so that I can plan multiple efforts separately.

#### Acceptance Criteria

1. THE GrowthX SHALL allow one Workspace to contain multiple Campaigns.
2. WHEN the Approver creates a Campaign, THE GrowthX SHALL require and store a free-text goals field and a free-text target audience field.
3. WHERE the Approver provides a budget, THE GrowthX SHALL store the budget as a numeric amount and an ISO 4217 currency code.
4. IF a budget amount is negative or the currency code is not a valid ISO 4217 code, THEN THE GrowthX SHALL reject the Campaign and return a validation error that names the invalid field.
5. THE GrowthX SHALL treat Campaign start date, end date, and date range as optional.
6. IF a Campaign has an end date earlier than its start date, THEN THE GrowthX SHALL reject the Campaign and return a validation error.
7. THE GrowthX SHALL associate every Brief version with exactly one Campaign.
8. WHEN the Approver submits a changed Brief with `expectedVersion` equal to the current version, THE GrowthX SHALL store a new Brief version incremented by one.
9. IF a Brief submission carries an `expectedVersion` that differs from the current Brief version of the Campaign, THEN THE GrowthX SHALL reject the submission with HTTP 409.
10. WHEN the Workspace database already contains a pre-MVP Brief, THE GrowthX SHALL associate the Brief with one Campaign created by the migration and retain its version number.
11. THE GrowthX SHALL treat the Campaign budget, start date, end date, date range, location, constraints, and preferences as optional.
12. WHEN the Approver creates a Campaign without one or more optional fields, THE GrowthX SHALL create the Campaign and record each absent field as Not_Provided.
13. IF a budget has an amount without a currency code, or a currency code without an amount, THEN THE GrowthX SHALL reject the Campaign and return a validation error that names the missing field.
14. WHILE an optional Campaign field is Not_Provided, THE Orchestrator SHALL still create and run tasks for the Campaign.
15. WHILE an optional Campaign field is Not_Provided, THE Research_Agent and THE Planning_Agent SHALL report the field as not provided and SHALL NOT invent a value for it.

### Requirement 3: Workspace Sessions and Campaign Isolation

**User Story:** As an Approver, I want my workspace and its campaigns isolated from others, so that agents and routes cannot read or alter data they are not authorized to touch.

#### Acceptance Criteria

1. WHEN a new Workspace is created, THE GrowthX SHALL create a new Session bound to that Workspace, with no access to the data or Session of any other Workspace.
2. IF a request carries a Session that is bound to a different Workspace than the requested resource, THEN THE GrowthX SHALL reject the request and return no data from the requested Workspace.
3. IF a request to a Workspace-scoped route carries no Session, an expired Session, or an invalid Session, THEN THE GrowthX SHALL return HTTP 401 and no Workspace data.
4. WHEN an agent task runs for a Campaign, THE Agent_Runtime SHALL allow the task to write only to state belonging to that Campaign.
5. IF an agent task attempts to write state belonging to a different Campaign, THEN THE Agent_Runtime SHALL reject the write and record an error on the task.
6. WHILE the Research_Agent, Planning_Agent, or Review_Agent runs, THE Agent_Runtime SHALL allow reads only of the task's own Campaign and the Catalog.
7. WHILE the Workflow_Agent runs an analysis task, THE Agent_Runtime SHALL allow read-only access to historical Campaigns of the same Workspace.
8. IF any agent or route attempts to read or write data of a different Workspace, THEN THE GrowthX SHALL reject the operation.
9. THE GrowthX SHALL treat the Session holder as the Approver without requiring a user account.
10. WHEN a request carries a valid Session, THE GrowthX SHALL grant access to the existing Workspace bound to that Session and to its data.
11. IF a Session is expired or invalid, THEN THE GrowthX SHALL return no data of any Workspace and SHALL give no indication whether the referenced Workspace exists.
12. WHEN a request without a valid Session asks to create a new Workspace, THE GrowthX SHALL create a new Workspace and Session under criterion 1 and SHALL NOT link the new Workspace to the Workspace of the expired or invalid Session.

### Requirement 4: Deterministic Orchestrator

**User Story:** As a developer, I want a deterministic orchestrator to coordinate four agents, so that routing is auditable and reproducible.

#### Acceptance Criteria

1. THE Orchestrator SHALL be implemented as application code and SHALL NOT invoke a Model_Client for routing decisions.
2. THE GrowthX SHALL provide exactly four LLM agent roles in the full product: Research_Agent, Planning_Agent, Workflow_Agent, and Review_Agent.
3. WHEN a Campaign run is requested, THE Orchestrator SHALL create tasks for agents through the persisted task queue.
4. THE Orchestrator SHALL route each task to the agent role defined for the task type in Requirement 6.
5. THE Agent_Runtime SHALL enforce, for each agent role, a tool allowlist, JSON-schema validation of tool inputs and final results, and explicit limits on tool calls, model rounds, and tasks per run.
6. WHEN an agent produces a result, THE Agent_Runtime SHALL commit staged writes through one atomic repository transaction.
7. IF a task result arrives for a Brief version that is no longer current, THEN THE Orchestrator SHALL store the result marked as a Stale_Result and record the reason.
8. THE Orchestrator SHALL impose a hard iteration bound on every review and revision loop and SHALL record a visible terminal state for every loop.
9. THE GrowthX SHALL contain no fifth LLM manager agent and no dependency on LangGraph, CrewAI, or another agent orchestration framework.
10. THE GrowthX SHALL provide no agent tool that sends messages, publishes content, makes purchases, or trains models.
11. WHEN a result is a Stale_Result, THE Orchestrator SHALL apply none of the staged writes of the result to Campaign state and SHALL enqueue no follow-up task from the result.
12. THE GrowthX SHALL keep every Stale_Result retrievable for execution tracing.
13. THE GrowthX SHALL provide no agent tool that performs a Human_Only_Action, in any agent role and in any Configuration.
14. IF a model requests a tool that is not on the allowlist of the running agent role and Configuration, THEN THE Agent_Runtime SHALL reject the call and record the rejection on the task.

### Requirement 5: Model Access and Instrumentation

**User Story:** As an evaluator, I want every model call recorded and routed through one replaceable client, so that runs are measurable and reproducible.

#### Acceptance Criteria

1. THE GrowthX SHALL perform all model access through the Model_Client interface.
2. WHEN a model call completes, THE GrowthX SHALL persist a Usage_Record with input tokens, output tokens, latency in milliseconds, tool-call count, task identifier, agent role, and error status.
3. IF a model call fails, THEN THE GrowthX SHALL persist a Usage_Record with the error status and SHALL leave the task in a retry or failed state according to the existing retry rules.
4. WHERE a Scripted_Model_Client is configured, THE GrowthX SHALL run the full agent path without network access.
5. WHERE a component of the Agent_Runtime, the Orchestrator, or catalog search has an injected clock, THE component SHALL NOT read the wall clock directly.
6. THE GrowthX SHALL run automated tests against temporary SQLite databases and SHALL NOT write to the developer database.
7. WHEN the worker starts without model credentials, THE GrowthX SHALL exit with an error before claiming any task.
8. IF the provider reports no token count for a failed or incomplete model call, THEN THE GrowthX SHALL record the input tokens and output tokens of the Usage_Record as Unavailable_Usage.
9. THE GrowthX SHALL NOT record a token count of zero for a call whose token count the provider did not report.
10. WHEN usage aggregates are computed, THE GrowthX SHALL report the sum over calls with available token counts and, separately, the number of calls with Unavailable_Usage.
11. THE GrowthX SHALL NOT require an injected clock in components other than the Agent_Runtime, the Orchestrator, and catalog search.

### Requirement 6: Agent Responsibilities

**User Story:** As a growth team member, I want each agent to own a clear job, so that research, planning, workflow analysis, and review stay separate and accountable.

#### Acceptance Criteria

1. WHEN the Research_Agent runs, THE Research_Agent SHALL search the Catalog, compare candidate events against the Campaign goals and any provided constraints, cite Evidence_Records, and list missing or uncertain information.
2. WHEN the Planning_Agent runs, THE Planning_Agent SHALL produce participation plans with a task checklist, invitation drafts, and revisions of drafts.
3. WHEN the Workflow_Agent runs an analysis task, THE Workflow_Agent SHALL analyze Historical_Materials and Feedback_Comments and return Recurring_Patterns and Automation_Proposals.
4. WHEN the Workflow_Agent runs an execution task, THE Workflow_Agent SHALL execute only an approved and enabled Instruction_Version.
5. WHEN the Review_Agent runs, THE Review_Agent SHALL validate evidence, budget, constraints, approvals, and conflict handling of another agent's output and return Review_Findings.
6. WHEN an Organizer_Reply is stored, THE Orchestrator SHALL route reply interpretation to the Planning_Agent, and SHALL route feedback-pattern analysis of the reply to the Workflow_Agent.
7. THE GrowthX SHALL give each agent role a distinct tool allowlist that excludes tools of other roles that are not required for that role.
8. THE GrowthX SHALL replace hackathon-specific role prompts with prompts for the four MVP agent roles.

### Requirement 7: Event Discovery, Comparison, and Plans

**User Story:** As a growth team member, I want recommended events and a participation plan with evidence, so that I can decide where to take part.

#### Acceptance Criteria

1. WHEN a Campaign run is requested, THE Research_Agent SHALL return candidate events from the Catalog with an Evidence_Record reference for each factual claim.
2. WHEN two or more candidate events are returned, THE GrowthX SHALL present a comparison of the candidates against the Campaign goals and against each of budget, dates, location, and constraints that is provided, and SHALL mark each criterion that is Not_Provided as not provided.
3. WHEN a candidate event is selected by the Approver, THE Planning_Agent SHALL produce a participation plan containing an action (attend, sponsor, speak, or host), a rationale, and a task checklist.
4. WHEN the Planning_Agent produces an invitation draft, THE GrowthX SHALL store the draft as the first Draft_Revision with its Campaign, author role, and timestamp.
5. THE GrowthX SHALL keep event selection under human control, and THE Orchestrator SHALL NOT select an event on behalf of the Approver.
6. IF a Campaign budget amount exists, THEN THE GrowthX SHALL compare the sum of plan cost line items against the budget amount using the same currency.
7. IF a plan cost line item uses a currency that differs from the Campaign currency, THEN THE GrowthX SHALL mark the comparison as `unknown` and SHALL NOT convert currencies.

### Requirement 8: Event Data Freshness and Temporal Rules

**User Story:** As a user, I want recommendations to respect the current date and flag missing information, so that I never act on a past event or an invented price.

#### Acceptance Criteria

1. WHEN an interactive recommendation request runs, THE GrowthX SHALL use the actual current date as the Reference_Date for event dates.
2. WHEN an Evaluation_Harness run executes, THE GrowthX SHALL use the Evaluation_Clock of 2026-09-28 as the Reference_Date in every Configuration.
3. THE GrowthX SHALL present an event as upcoming only WHEN the event end date, or the start date if no end date exists, is not earlier than the Reference_Date.
4. WHEN an event field such as price, date, or organizer contact is absent from the Catalog, THE GrowthX SHALL mark the field as `unknown` in recommendations and drafts.
5. THE GrowthX SHALL NOT represent an `unknown` price as free or as zero.
6. THE GrowthX SHALL read event data only from the existing frozen Catalog and SHALL NOT refresh the Catalog or perform live web search for the MVP.
7. WHEN the Catalog data is older than the actual current date, THE GrowthX SHALL display the Catalog cutoff date of 2026-09-28 alongside interactive recommendations.
8. THE GrowthX SHALL keep the Catalog read-only, and the CI SHALL verify the Catalog SHA-256 checksum before and after the test suite.
9. WHILE an Evaluation_Harness run executes, THE GrowthX SHALL evaluate the cutoff-date display condition of criterion 7 using only the Evaluation_Clock and SHALL ignore the real-world date.
10. IF the start and end dates of an event are absent or cannot be parsed, THEN THE GrowthX SHALL label the event as Date_Unknown and unverified.
11. WHILE an event is labelled Date_Unknown, THE GrowthX SHALL NOT present the event as upcoming and SHALL NOT count the event among upcoming events.
12. WHEN the Research_Agent returns an event labelled Date_Unknown, THE Research_Agent SHALL list the missing date among the missing or uncertain information.

### Requirement 9: Ingestion of Historical Materials and Organizer Replies

**User Story:** As a growth team member, I want to add previous campaign materials and real organizer replies, so that agents can analyze feedback history.

#### Acceptance Criteria

1. WHEN the Approver pastes text, THE GrowthX SHALL store the text as a Source_Record linked to a Campaign.
2. WHEN the Approver uploads a file with the extension `.txt`, `.md`, or `.csv`, THE GrowthX SHALL store the file content as a Source_Record linked to a Campaign.
3. IF the Approver attempts to upload a file with any other extension, THEN THE GrowthX SHALL reject the upload and return an error that lists the accepted extensions.
4. IF the Approver attempts to upload a file that is not valid UTF-8 text, THEN THE GrowthX SHALL reject the upload and return an error that names the invalid encoding.
5. WHEN the Approver submits an Organizer_Reply by manual entry or by upload, THE GrowthX SHALL store the reply as a Source_Record with the type `organizer_reply` and without requiring a simulated flag.
6. WHEN Historical_Material from a previous Campaign is ingested, THE GrowthX SHALL link the Source_Record to the previous Campaign and SHALL record the source of the material.
7. THE GrowthX SHALL store every Source_Record with an identifier, Workspace, Campaign, type, original text, filename if any, and creation timestamp.
8. THE GrowthX SHALL leave Source_Record original text unchanged after storage.
9. WHEN a `.csv` file is ingested, THE GrowthX SHALL store the file as text and SHALL preserve all rows and columns.
10. THE GrowthX SHALL treat all ingested content as untrusted data, and THE Agent_Runtime SHALL present ingested content to agents as quoted data and SHALL NOT interpret it as instructions.
11. THE GrowthX SHALL provide no PDF or Word processing, no email integration, and no automatic ingestion pipeline.
12. IF the Approver attempts to upload a file that exceeds the maximum upload size, THEN THE GrowthX SHALL reject the upload and return an error that names the size limit.

### Requirement 10: Feedback, Revisions, Conflicts, and Unresolved Decisions

**User Story:** As a reviewer, I want comments linked to their sources and revisions, with contradictions and open decisions kept visible, so that nothing is silently merged or settled.

#### Acceptance Criteria

1. WHEN a Feedback_Comment is stored, THE GrowthX SHALL link the comment to a Source_Record, a Draft_Revision, and a Campaign.
2. IF a Feedback_Comment references a Source_Record, Draft_Revision, or Campaign that does not exist in the same Workspace, THEN THE GrowthX SHALL reject the comment with a validation error.
3. THE GrowthX SHALL retain the original draft and every Draft_Revision of an invitation, each with an identifier and a timestamp.
4. WHEN two or more Feedback_Comments on the same Draft_Revision contradict each other, THE GrowthX SHALL store a Conflict_Record that references the contradicting comments.
5. WHEN a Conflict_Record exists, THE GrowthX SHALL keep the contradicting comments unmodified and SHALL NOT merge them into a single comment.
6. WHEN a decision requires a human and none is recorded, THE GrowthX SHALL store an Unresolved_Decision with a reference to the related comments or Conflict_Record.
7. WHEN the Approver records a decision for an Unresolved_Decision, THE GrowthX SHALL store the decision with the Session identifier and timestamp and SHALL mark the Unresolved_Decision resolved.
8. THE GrowthX SHALL define an item as unresolved WHILE the item is a Conflict_Record without a recorded decision or an Unresolved_Decision without a recorded decision.
9. WHEN a Conflict_Record is marked resolved by the Approver, THE GrowthX SHALL retain the original conflicting comments.
10. THE GrowthX SHALL record whether the creator of each Feedback_Comment is a human or an agent.

### Requirement 11: Workflow Discovery and Automation Proposals

**User Story:** As a growth team member, I want the system to propose automation only when the evidence is sufficient, so that I trust its suggestions.

#### Acceptance Criteria

1. WHEN the Workflow_Agent analyzes Historical_Materials, THE Workflow_Agent SHALL identify candidate recurring tasks and return, for each candidate, a task-type label and supporting examples that each reference a saved Source_Record identifier and cite an excerpt of that Source_Record.
2. THE GrowthX SHALL count Independent_Evidence as the number of distinct Source_Records, grouped on one basis only: distinct Review_Rounds or distinct Campaigns.
3. THE GrowthX SHALL count duplicate comments in one Review_Round as one supporting example.
4. THE GrowthX SHALL count each Source_Record at most once and SHALL NOT combine a Review_Round count with a Campaign count or count one Source_Record under both its Review_Round and its Campaign.
5. IF a candidate lacks examples from at least two distinct Campaigns or from at least two distinct Review_Rounds, with a mix of the two bases not qualifying, THEN THE GrowthX SHALL set the Pattern_Status to `insufficient_evidence`.
6. IF the counted examples of a candidate do not meet Same_Activity, THEN THE GrowthX SHALL set the Pattern_Status to `insufficient_evidence`.
7. WHEN the Review_Agent evaluates a candidate, THE Review_Agent SHALL return a Blocking_Finding if the cited excerpts do not show the same task type and intent.
8. IF a supporting example references a Source_Record identifier that does not exist, THEN THE GrowthX SHALL exclude the example from the evidence count and SHALL raise a Blocking_Finding.
9. WHILE a Pattern_Status is `insufficient_evidence`, THE GrowthX SHALL NOT allow the Approver to approve an Automation_Proposal for the pattern.
10. WHEN a candidate meets the threshold of criterion 5, meets Same_Activity, and has no Blocking_Finding from criterion 7, THE GrowthX SHALL set the Pattern_Status to `proposable` and create an Automation_Proposal.
11. THE GrowthX SHALL support exactly one automation type in the MVP: consolidation of invitation feedback into a Revision_Brief.
12. IF the Workflow_Agent proposes an automation type other than invitation feedback consolidation, THEN THE GrowthX SHALL reject the proposal.
13. THE GrowthX SHALL show each Automation_Proposal with its supporting examples and their Source_Record references before approval.

### Requirement 12: Instruction Approval, Versioning, and Authorization

**User Story:** As an Approver, I want to approve, edit, disable, and revoke automation instructions with a full record, so that no automation runs without my explicit permission.

#### Acceptance Criteria

1. THE GrowthX SHALL keep the content of each Instruction_Version (instruction text, scope, and automation type) immutable after creation.
2. THE GrowthX SHALL hold the Instruction_Status of each Instruction_Version separately from its content and SHALL change the Instruction_Status only through the Human_Only_Actions in criteria 4 to 9.
3. THE GrowthX SHALL permit only these Instruction_Status transitions: `proposed` to `approved`, `approved` to `disabled`, `disabled` to `approved`, `approved` to `revoked`, and `disabled` to `revoked`, with `revoked` as a final state.
4. WHEN the Approver approves an Automation_Proposal with Pattern_Status `proposable`, THE GrowthX SHALL create an Instruction_Version with Instruction_Status `approved` bound to that exact instruction text and authorized scope.
5. WHEN the Approver edits an Instruction_Version, THE GrowthX SHALL create a new Instruction_Version with the changed content and Instruction_Status `proposed`, and SHALL leave the content, Instruction_Status, and Approval_Records of the prior Instruction_Version unchanged.
6. WHEN the Approver approves an Instruction_Version with Instruction_Status `proposed`, THE GrowthX SHALL set its Instruction_Status to `approved`.
7. WHEN the Approver disables an Instruction_Version with Instruction_Status `approved`, THE GrowthX SHALL set its Instruction_Status to `disabled`.
8. WHEN the Approver restores an Instruction_Version with Instruction_Status `disabled`, THE GrowthX SHALL set its Instruction_Status to `approved`.
9. WHEN the Approver revokes an Instruction_Version with Instruction_Status `approved` or `disabled`, THE GrowthX SHALL set its Instruction_Status to `revoked`.
10. WHEN the Approver explicitly enables an Instruction_Version with Instruction_Status `approved` for a Campaign, THE GrowthX SHALL persist a Campaign_Enablement for that Instruction_Version and Campaign.
11. WHERE an approved Instruction_Version has Workspace-level scope, THE GrowthX SHALL allow the Approver to enable the Instruction_Version for additional Campaigns of the same Workspace, and each enablement SHALL be a separate explicit act.
12. WHEN the Approver withdraws a Campaign_Enablement, THE GrowthX SHALL persist the withdrawal and SHALL treat the Instruction_Version as not enabled for that Campaign.
13. THE GrowthX SHALL NOT carry a Campaign_Enablement over from one Instruction_Version to a new Instruction_Version.
14. WHEN an Instruction_Version is enabled for a Campaign, THE GrowthX SHALL leave the read and write scope of every agent unchanged with respect to Requirement 3.
15. IF the Approver requests a transition that criterion 3 does not permit, an approval of an Automation_Proposal with Pattern_Status `insufficient_evidence`, or an enablement of an Instruction_Version that is not `approved`, THEN THE GrowthX SHALL reject the request, SHALL return an error that names the reason, and SHALL leave all states unchanged.
16. WHEN the Approver approves, edits, restores, enables, disables, revokes, or withdraws an enablement, THE GrowthX SHALL persist an Approval_Record with the action, the timestamp, the Instruction_Version, the Campaign where applicable, and the Session identifier.
17. THE GrowthX SHALL keep Approval_Records append-only and immutable, and SHALL retain the Approval_Records of every prior Instruction_Version after edits.
18. WHEN a task requests execution of an Instruction_Version, THE Orchestrator SHALL verify that the Instruction_Version is `approved`, that a Campaign_Enablement exists and is not withdrawn for the Campaign, and that the Session's Workspace owns the Instruction_Version.
19. IF an execution is requested for an Instruction_Version that is `proposed`, `disabled`, or `revoked`, or that lacks an active Campaign_Enablement for the Campaign, THEN THE Orchestrator SHALL reject the request and record the reason.
20. WHEN the Orchestrator commits an execution result, THE Orchestrator SHALL repeat the verification of criterion 18 inside the same atomic repository transaction that writes the result.
21. IF the verification inside the commit transaction fails because the Instruction_Version was disabled, revoked, or no longer enabled during execution, THEN THE Orchestrator SHALL abort the commit so that the Campaign state is unchanged, SHALL retain the result as a Stale_Result, and SHALL enqueue no follow-up task.

### Requirement 13: Feedback Consolidation Automation

**User Story:** As a growth team member, I want review comments consolidated into a structured revision brief, so that I can revise an invitation without reading every comment.

#### Acceptance Criteria

1. WHEN an approved and enabled Instruction_Version executes for a Campaign draft, THE Workflow_Agent SHALL produce a Revision_Brief for the draft.
2. THE Revision_Brief SHALL contain grouped comments, requested revisions, source references, Conflict_Records, Unresolved_Decisions, approved decisions, and a prioritized checklist.
3. THE GrowthX SHALL reference at least one Source_Record or Feedback_Comment identifier for every requested revision in the Revision_Brief.
4. WHEN the Revision_Brief includes a Conflict_Record, THE GrowthX SHALL list the contradicting comments separately and SHALL NOT state a resolution unless the Approver recorded a decision.
5. THE GrowthX SHALL include in the Revision_Brief only decisions that carry an Approver decision record as approved decisions.
6. THE GrowthX SHALL store each Revision_Brief with the Instruction_Version identifier, Campaign, Draft_Revision identifier, and timestamp.
7. WHEN a Revision_Brief is produced, THE GrowthX SHALL submit the Revision_Brief to the Review_Agent before presenting the Revision_Brief as complete.
8. THE GrowthX SHALL NOT modify an invitation draft, send a message, or publish content as part of the automation.
9. IF the Campaign has no Feedback_Comments for the draft, THEN THE GrowthX SHALL return an empty Revision_Brief with a message that no feedback exists.

### Requirement 14: Review Agent and Correction Loops

**User Story:** As an Approver, I want a reviewer that blocks fabricated or unsafe outputs and requests bounded corrections, so that errors surface before I rely on an output.

#### Acceptance Criteria

1. WHEN an agent output is submitted for review, THE Review_Agent SHALL return zero or more Review_Findings, each with a severity of `blocking` or `warning`.
2. THE Review_Agent SHALL classify as Blocking_Findings: fabricated evidence, budget violations, invented approvals, and unresolved conflicts presented as settled.
3. THE Review_Agent SHALL classify as Warning_Findings: explicitly unknown prices, weak evidence, optional missing information, and stylistic concerns.
4. THE GrowthX SHALL verify evidence identifiers, budget arithmetic, and approval references with deterministic checks in addition to the Review_Agent.
5. WHEN a Blocking_Finding exists, THE Orchestrator SHALL create a Correction_Request addressed to the responsible agent.
6. WHEN a Correction_Attempt completes, THE Orchestrator SHALL submit the corrected output for re-review.
7. THE Orchestrator SHALL permit at most two Correction_Attempts per reviewed output.
8. IF Blocking_Findings remain after the second Correction_Attempt is re-reviewed, THEN THE Orchestrator SHALL set the Output_Status of the reviewed output to `needs_human_review` and SHALL stop further correction.
9. WHEN no Blocking_Finding remains, THE Orchestrator SHALL set the Output_Status of the reviewed output to `PASSED`.
10. WHILE the Output_Status is `PASSED`, THE GrowthX SHALL keep any Warning_Findings visible.
11. THE GrowthX SHALL persist for each Review_Finding the severity, supporting evidence, responsible agent, Correction_Requests, and resolution status.
12. THE GrowthX SHALL record the number of Correction_Attempts for each reviewed output for use in evaluation.
13. THE Review_Agent SHALL NOT approve instructions, record Approver decisions, or resolve Conflict_Records.

### Requirement 15: User Interface for the MVP Flow

**User Story:** As an Approver, I want a UI that covers the campaign, ingestion, review, and approval flow, so that I can demonstrate and use the MVP end to end.

#### Acceptance Criteria

1. THE GrowthX SHALL provide screens or panels to create and select Campaigns within the Workspace.
2. THE GrowthX SHALL provide a screen or panel to paste text, upload `.txt`, `.md`, and `.csv` files, and enter Organizer_Replies for a Campaign.
3. THE GrowthX SHALL display for each Campaign the Draft_Revision history, Feedback_Comments, Conflict_Records, and Unresolved_Decisions.
4. THE GrowthX SHALL display Automation_Proposals with Pattern_Status and supporting Source_Record references.
5. THE GrowthX SHALL provide controls for the Approver to approve, edit, restore, enable, disable, and revoke an Instruction_Version, to withdraw a Campaign_Enablement, and to record decisions on Unresolved_Decisions.
6. THE GrowthX SHALL display Revision_Briefs and Review_Findings with their severities and the final Output_Status (`PASSED` or `needs_human_review`).
7. WHILE the approve control is disabled because the Pattern_Status is `insufficient_evidence`, THE GrowthX SHALL display the reason.
8. WHEN the user interface changes, THE GrowthX SHALL update the browser smoke test to cover the changed flow.
9. IF a change alters the user interface and the browser smoke test is not updated and passing, THEN THE GrowthX CI SHALL block merge and deployment of the change.

### Requirement 16: Synthetic Data and Evaluation Cases

**User Story:** As a researcher, I want eight independently labeled evaluation cases kept apart from development data, so that results are credible.

#### Acceptance Criteria

1. THE GrowthX SHALL include realistic synthetic data for development and a separate set of eight Evaluation_Cases.
2. THE GrowthX SHALL store Evaluation_Cases separately from development and prompt-tuning examples, and no development example SHALL be identical to an Evaluation_Case.
3. THE Evaluation_Cases SHALL include at least one case of each of these types: recurring review work, a one-off task, conflicting feedback, and missing prices or constraints.
4. THE GrowthX SHALL store for each Evaluation_Case the fixed inputs, the expected labels, and the identifiers of two labelers.
5. WHEN two labelers disagree on a label, THE GrowthX SHALL record both labels and the agreed resolution before the Evaluation_Case is frozen.
6. WHEN an Evaluation_Case is frozen, THE GrowthX SHALL record a checksum of the case file.
7. IF the checksum of a frozen Evaluation_Case differs at the start of an Evaluation_Harness run, THEN THE Evaluation_Harness SHALL fail the entire run immediately, before executing any Evaluation_Case, and SHALL report the mismatching case.
8. THE GrowthX SHALL NOT include real personal data in the synthetic data.

### Requirement 17: Evaluation Harness and Configurations

**User Story:** As a researcher, I want 72 reproducible runs across three configurations under equal budgets, so that I can compare the architectures fairly.

#### Acceptance Criteria

1. THE Evaluation_Harness SHALL support three Configurations: C1 single-agent baseline, C2 multi-agent system with workflow suggestions disabled, and C3 full four-agent system.
2. WHEN the Evaluation_Harness runs C1, THE Evaluation_Harness SHALL execute one agent that holds the union of the tools needed for the case, drawn from the tool allowlists of Requirement 4 and excluding every tool that performs a Human_Only_Action.
3. WHEN the Evaluation_Harness runs C2, THE Evaluation_Harness SHALL disable Recurring_Pattern detection and Automation_Proposals.
4. THE Evaluation_Harness SHALL execute each Evaluation_Case three times in each Configuration, for a total of 72 runs.
5. THE Evaluation_Harness SHALL use the same Model_Client model, the same case inputs, the same Catalog, and the Evaluation_Clock in every run.
6. THE Evaluation_Harness SHALL apply the same total token budget and the same total tool-call budget to every Configuration.
7. IF a run reaches its token budget or tool-call budget, THEN THE Evaluation_Harness SHALL stop the run, SHALL record the termination reason, and SHALL retain the partial result.
8. THE Evaluation_Harness SHALL persist for each run the Configuration, case identifier, repetition number, start and end timestamps, Usage_Records, the number of model calls with Unavailable_Usage, tool-call count, Review_Findings, and Correction_Attempt count.
9. THE Evaluation_Harness SHALL isolate each run in its own temporary Workspace database.
10. IF a run fails, THEN THE Evaluation_Harness SHALL record the failure and SHALL count the failed run in the reported results.
11. WHEN the Evaluation_Harness is started, THE Evaluation_Harness SHALL refuse to call a paid model unless a separate authorization flag is supplied for that invocation.
12. WHERE a Scripted_Model_Client is selected, THE Evaluation_Harness SHALL run without network access and SHALL label the output as a mechanics check and not as an evaluation result.
13. THE Evaluation_Harness SHALL build the tool set of every Configuration only from the tool allowlists of Requirement 4, so that no Configuration holds a tool that performs a Human_Only_Action, sends, publishes, purchases, trains models, or writes outside the Campaign of the run.
14. WHILE a model call has Unavailable_Usage, THE Evaluation_Harness SHALL reserve the per-call output token limit against the token budget for budget enforcement and SHALL NOT record the reserved amount as usage.
15. WHEN the Evaluation_Harness reports budget consumption, THE Evaluation_Harness SHALL state for each Configuration the number of model calls with Unavailable_Usage.

### Requirement 18: Evaluation Metrics and Reporting

**User Story:** As a researcher, I want defined metrics with deterministic checks and human evaluation, so that conclusions are supported and honest.

#### Acceptance Criteria

1. THE Evaluation_Harness SHALL compute these metrics per run: recurring-task detection, unsupported suggestions, missed constraints, unresolved decisions, reviewer corrections, runtime, token usage, and tool calls.
2. THE Evaluation_Harness SHALL compute metrics that can be checked deterministically (for example evidence identifier existence, budget arithmetic, and constraint presence) without a model.
3. WHERE a metric requires judgment, THE GrowthX SHALL record a human label for the run.
4. WHERE an LLM judge is used, THE GrowthX SHALL record the judge as optional and SHALL NOT use the judge as the sole basis for a reported metric.
5. THE Evaluation_Harness SHALL produce a report that lists every metric by Configuration and case, the failed runs, and the labeler disagreements.
6. THE report SHALL state that scripted-model tests verify mechanics only and that live behavior is represented only by authorized live runs.
7. THE report SHALL NOT claim human time savings unless human task completion time was measured and recorded.
8. WHEN the report is generated twice from the same stored run data, THE Evaluation_Harness SHALL produce identical metric values.
9. WHERE a Configuration lacks the capability that a metric measures, THE Evaluation_Harness SHALL record the metric as N/A with the reason, and SHALL NOT record zero. Recurring-task detection in C2 is N/A, and the missed-constraints metric of a case that defines no constraints is N/A.
10. THE report SHALL display N/A as the text `N/A` with its reason and SHALL display a measured zero as the number 0.
11. WHEN the Evaluation_Harness computes means and totals, THE Evaluation_Harness SHALL exclude N/A values and SHALL report the count of N/A values beside each result.
12. WHEN the report presents token usage, THE report SHALL state the number of model calls with Unavailable_Usage and SHALL compute totals only over calls with available token counts.

### Requirement 19: Out of Scope

**User Story:** As a project owner, I want explicit exclusions, so that the MVP stays focused.

#### Acceptance Criteria

1. THE GrowthX SHALL NOT send emails or messages, publish content, process payments, or train models autonomously or through an agent tool.
2. THE GrowthX SHALL NOT process PDF or Word files.
3. THE GrowthX SHALL NOT integrate with email providers.
4. THE GrowthX SHALL NOT refresh the Catalog or perform live web search in the MVP.
5. THE GrowthX SHALL NOT require user accounts or authentication beyond the Workspace Session.
6. THE GrowthX SHALL NOT require Taste brand extraction, cover generation, share links, the prepared Taste Labs demo, or Cloudflare parity for the MVP, and these existing features SHALL remain in the repository.
7. THE GrowthX SHALL NOT run paid model evaluations without separate authorization.
8. THE GrowthX SHALL NOT add a fifth LLM manager agent, LangGraph, CrewAI, or another orchestration framework.

### Requirement 20: Engineering Quality Gates

**User Story:** As a maintainer, I want CI to enforce the baseline, so that MVP work cannot regress it.

#### Acceptance Criteria

1. THE GrowthX SHALL run typecheck, lint with 0 errors, tests, build, and browser smoke in CI for every change.
2. THE GrowthX SHALL cover each new Requirement behavior that is deterministic with automated tests that use a Scripted_Model_Client, an injected clock, and a temporary SQLite database.
3. THE GrowthX SHALL include automated tests for campaign write isolation, Workflow_Agent read-only access to historical Campaigns, and rejection of cross-Workspace access.
4. THE GrowthX SHALL include automated tests that execution is rejected for `proposed`, `disabled`, `revoked`, and not-enabled Instruction_Versions, and that a result is retained as a Stale_Result without applying writes or follow-up tasks when authorization is lost before or during commit, including a revocation that races an execution commit.
5. THE GrowthX SHALL include a round-trip test for each serializer or parser that is added, including the `.csv` ingestion and the Revision_Brief storage: reading the stored value SHALL return an equivalent value to the value submitted.
6. THE GrowthX SHALL keep secrets and generated artifacts out of version control.

## Traceability

| MVP item | Requirements |
|---|---|
| 1. Campaign goals, audience, budget | 2, 3 |
| 2. Event discovery and comparison | 6, 7, 8 |
| 3. Participation plan | 7 |
| 4. Invitation draft | 7, 10 |
| 5. Ingest historical materials and organizer replies | 9, 10 |
| 6. Identify repetitive review workflows | 11 |
| 7. Propose automation and obtain approval | 11, 12, 15 |
| 8. Execute the approved automation | 12, 13 |
| 9. Review and revision loops | 4, 14 |
| 10. Persistent campaign state and approved instructions | 1, 2, 3, 12 |
| E1. 8 cases, 3 runs | 16, 17 |
| E2. Three configurations | 17 |
| E3. Metrics | 5, 17, 18 |
| Decisions D1 to D5 | 1, 3, 4, 5, 12, 17, 19 |
| Freshness B7 | 8, 17 |
| Optional campaign fields (B1) | 2, 6, 7 |
| Session persistence and expiry | 3 |
| Stale results and execution tracing | 4, 12 |
| Evaluation-only configuration safety and N/A metrics | 4, 17, 18 |
| Unavailable token usage | 5, 17, 18 |

## Open Items

These are not decided by D1 to D5 or B1 to B7.

1. Maximum upload size and maximum pasted text length (Requirement 9).
2. Method and threshold for detecting that two Feedback_Comments contradict each other, and whether the Workflow_Agent, the Review_Agent, or a deterministic rule proposes a Conflict_Record (Requirement 10).
3. Definition of a Review_Round identifier, the minimum fields of Historical_Material needed to attribute comments to a Review_Round, and the controlled list of task-type labels used for Same_Activity (Requirement 11).
4. Anthropic model ID, per-call token limits, and the numeric token and tool-call budgets for the Evaluation_Harness (Requirements 5 and 17).
5. Scoring rubric for each metric, the authors of the Evaluation_Cases, and the identity of the two labelers (Requirements 16 and 18).
6. Definition of the C1 tool union and how the "comparable budgets" are measured when C1 and C3 differ in call structure (Requirement 17).
7. Whether and how legacy unrouted UI components are kept or removed (Requirement 15).
8. Maximum review iterations beyond the two Correction_Attempts when a loop spans several agents (Requirement 14).
9. Whether the Workflow_Agent's Workspace-level read of historical Campaigns requires a per-analysis authorization step in addition to the Session (Requirement 3).
10. Session lifetime and the token signing or hashing scheme (Requirement 3).
11. Confirmation that goals and target audience are the only required Campaign fields, and that the budget is optional (Requirement 2).
12. Confirmation that a `disabled` Instruction_Version may be restored to `approved` (Requirement 12, criterion 8).
13. How the approval state of an Instruction_Version is seeded for Evaluation_Cases that exercise execution, without giving any agent a Human_Only_Action (Requirements 12 and 17).
14. Whether C1 has a recurring-task detection or review capability, which determines whether those metrics are N/A for C1 (Requirement 18).
