# MCP REGISTRY → WEB TOOLS → CONTROLLED EXECUTION ROADMAP

Data: 2026-05-05
Status: current_plan
Zakres: bezpieczna ewolucja MCP od registry plan-only do controlled execution z etapem web_tools

---

## CURRENT STATE (CONFIRMED)

> 2026-05-05 update: V7.0 and V7.1 are now CLOSED. `tool_registry_execute` is deployed, tested, and runtime-verified as simulation-only. V7.2 is now explicitly POSTPONED pending stronger justification, a concrete contract, and completion of the current priority tooling track. Dispatch and real execution remain NOT DEPLOYED.



Stage: V6.5 closed / V7.0 planned

- registry: DONE
- policy: DONE
- preflight: DONE
- plan: DONE
- outputSchema: DONE for all registry tools
- web_tools v1a/v1c: DONE
- runtime verification: DONE
- dispatch: NOT DEPLOYED
- execution: NOT DEPLOYED

Current model:

```text
MCP tools surface
  -> registry control-plane
  -> preflight / plan
  -> web_tools read-only intelligence
  -> no dispatch
  -> no execution
```

This is intentional. The system is safe, mostly read-only at new-control-plane level, and side-effect free for registry operations.

---

## GOVERNING RULES

These rules are controlling, not advisory:

1. System exists only if it is enforced in runtime.
2. Unused code is not an implemented feature.
3. Every decision must be auditable.
4. Multi-step execution requires one global decision.
5. Policy is real only if it is in the critical path.
6. Rollback must remain available for every deployment.
7. Descriptor/schema changes require client refresh after MCP restart.
8. No large deployments.
9. Execution must not be introduced before dry-run execution simulation is stable.

---

## COLLISION ANALYSIS

### Collision 1 — dispatch before enforcement

Problem:

Dispatch without audit, anomaly influence, and critical-path policy would create an unsafe pseudo-execution layer.

Decision:

Do not introduce real dispatch yet.

Resolution:

Insert V7.0 as dry-run execution simulation before real controlled dispatch.

---

### Collision 2 — execution before global decision model

Problem:

Execution can create side effects. Multi-step operation without one global decision risks partial execution and inconsistent state.

Decision:

Execution is blocked until a global decision model exists.

Resolution:

V7.0 simulates execution only. V7.5 introduces explicit global decision checks before V8.

---

### Collision 3 — registry scaling vs single-tool registry

Problem:

Initial registry had only one logical tool: `code_analysis`. Moving directly to dispatch would test execution before testing system extensibility.

Decision:

V6.5 added a small read-only web tools family first.

Resolution:

`http_get` and `check_pypi_package` are available as read-only developer-intelligence tools.

---

### Collision 4 — web access vs open-world risk

Problem:

Web tools can leak data, fetch unbounded content, follow redirects into unsafe targets, or become a general browser.

Decision:

Web tools v1 are allowlisted, read-only, bounded, no-auth, no-cookies, no writes, no disk downloads.

Resolution:

Start with developer-intelligence endpoints only.

---

## PHASED ROADMAP

### V6 — Registry plan-only (DONE)

Scope:

- registry status/list/get/validate/policy/preflight/plan
- full outputSchema coverage
- runtime verification
- no dispatch
- no execution

Status: CLOSED

---

### V6.5 — Web tools v1 (DONE)

Goal:

Add a small, read-only, bounded web intelligence surface useful for MCP development and ROMION projects.

Implemented tools:

- `http_get` — allowlisted GET only, bounded response, no auth
- `check_pypi_package` — package metadata lookup, bounded JSON parsing

Deferred tools:

- `check_npm_package`
- `fetch_github_file`
- `download_docs`
- generic crawling
- recursive docs fetch
- unrestricted URLs
- authenticated requests
- writing fetched content to disk
- CVE aggregation beyond one vetted source

Known issue:

- connector-layer false positives may selectively block safe tools for some inputs; see `KNOWN_ISSUES_CONNECTOR_LAYER.md`.

Status: CLOSED

---

### V7.0 — Registry execute simulation (NEXT)

Goal:

Introduce the transition layer between plan and execution without enabling real execution.

New tool:

```text
tool_registry_execute
```

Mode:

```text
dry_run only
```

Scope:

- calls existing plan logic
- refuses operations that are not plan-ready
- simulates execution steps
- records audit event
- returns deterministic execution report

Hard constraints:

- no dispatch
- no filesystem writes
- no network calls
- no mutation
- execution_enabled remains false
- simulated_execution remains true

Expected output shape:

```text
status
connector_safe
dispatch_enabled
execution_enabled
simulated_execution
registry_id
tool
operation
found
enabled
allowed
reason
plan_ready
steps_count
simulated_steps
```

Exit conditions:

- tests pass
- outputSchema is explicit and flat enough for runtime
- `tool_registry_execute(code_analysis, read)` returns simulated
- `tool_registry_execute(code_analysis, mcp_apply)` returns blocked
- `tool_registry_execute(missing_tool, read)` returns not_found

---

### V7.5 — Global decision model

Goal:

Prepare multi-step operation safety.

Scope:

- one global allow/block decision per plan
- no partial execution
- plan consistency checks
- rollback checkpoint requirements

Execution remains disabled.

---

### V8 — Controlled dispatch

Goal:

Introduce dispatch without broad execution.

Minimal scope:

- one logical tool
- one read-only operation
- audit required
- policy required
- no project writes
- no network unless explicitly allowed by policy

---

### V9 — Controlled execution

Goal:

Introduce read-only execution in sandboxed mode.

Scope:

- sandbox only
- no side effects outside sandbox
- audit ledger required
- rollback checkpoint where relevant

---

### V10 — Extended execution

Goal:

Expand execution only after V9 is stable.

Possible scope:

- sandbox_write
- controlled RAG operations
- multi-step workflows

---

## NEXT ENGINEERING STEP

Implement V7.0 in the smallest deployable slice:

```text
tool_registry_execute = dry-run simulation only
```

No real dispatch.
No real execution.
No filesystem writes.
No network calls.

---

## 2026-05-04 UPDATE — V7.1 STATUS, ISSUES, AND ARCHITECTURAL RISKS

### Current execution-control status

V7.1 is deployed, tested, committed, pushed, and runtime-verified.

Confirmed runtime behavior:

```text
execution_mode=simulation -> status=simulated, plan_ready=true, steps_count=5
execution_mode=real       -> status=blocked, reason=execution_not_enabled
mcp_apply                 -> status=blocked, reason=operation_not_allowed
missing_tool              -> status=not_found, reason=tool_not_found
```

Current invariant:

```text
dispatch_enabled=false
execution_enabled=false
real execution is not deployed
```

V7.1 insight:

```text
execution_id + plan_hash create a deterministic execution surface,
enabling future idempotent execution and replay-safe audit.
```

### V7.1 staging issue: schema/audit cleanup

During V7.1 staging, `node --check` was insufficient to prove semantic correctness.

Observed before deploy:

- duplicated `execution_id` / `plan_hash` fields in staged outputSchema
- formatting artifacts merging `registry_id` and `execution_mode` on one line
- audit initially hard-coded `simulated_execution: true`

Resolution before deploy:

- outputSchema deduplicated
- return shapes normalized
- audit records `result.execution_mode`, `result.execution_id`, `result.plan_hash`, and `result.simulated_execution`
- static V7.1 tests added for envelope fields and audit fields

Lesson:

Execution-adjacent staging must be reviewed structurally, not only with syntax checks. JavaScript can parse while MCP descriptor semantics remain wrong.

### External review items accepted into roadmap

The following suggestions are accepted as valid risks, but not immediate implementation work:

1. `registerRegistryTools` centralization
   - Accepted risk.
   - Current decision: tolerate while registry surface is small.
   - Future step: V7.4 registry module boundary refactor before real dispatch.
   - Preferred first design: explicit modules, not auto-discovery.

2. Runtime tool version metadata
   - Accepted gap.
   - Future step: V7.3 expose registry/control-plane tool version metadata.

3. Regex-heavy tests
   - Accepted risk.
   - Current decision: keep regex tests as guardrails.
   - Future step: V7.6 add integration test harness before V8 dispatch.

4. Redirect/import magic
   - Accepted onboarding/documentation risk.
   - Future step: V7.7 developer architecture notes.

5. Core vs Extension boundary
   - Accepted architecture clarity issue.
   - Future step: V7.8 document Core / Control-plane Extension / Developer Extension / Data Extension boundaries.

### Adjusted near-term roadmap

```text
V7.2  execution_context binding, still simulation-only
V7.3  runtime tool version metadata
V7.4  registry module boundary refactor if complexity requires it
V7.5  global decision model
V7.6  integration test harness
V7.7  developer architecture notes
V7.8  Core vs Extension boundary documentation
V8    controlled dispatch only after prerequisites
```

When V7.2 eventually starts, its intended scope remains:

```text
tool_registry_execute + optional execution_context
```

No dispatch. No real execution. No project writes. No network calls.

---

## NEXT 3-5 DAYS

Status convention:

- `OPEN`
- `IN_PROGRESS`
- `CLOSED`

Short operational queue:

1. `CLOSED` — D1 docs consistency sweep after new commits
   - verify `CURRENT_STATE.md`, `REGISTRY.md`, `RUNTIME_CONTRACTS_CURRENT.md`, `DOCS_CATALOG.md`
   - canonical docs now match active runtime and test boundary after `project_truth_audit` rollout

2. `CLOSED` — D2 test names vs actual coverage review
   - check whether test names imply stronger coverage than they really provide
   - tightened misleading test titles while preserving milestone-oriented file structure

3. `CLOSED` — D3 registry control-plane consistency review
   - compare docs, outputSchema, tests, and runtime expectations for:
     - `tool_registry_status`
     - `tool_registry_list`
     - `tool_registry_get_tool`
     - `tool_registry_validate_tool`
     - `tool_registry_policy`
     - `tool_registry_preflight`
     - `tool_registry_plan`
     - `tool_registry_execute`
   - result:
     - active runtime, docs, and exposed control-plane remain consistent
     - `REGISTRY.md` now records the 2026-05-05 manual live verification pass explicitly
     - remaining runtime evidence is manual MCP invocation, not full automated end-to-end test coverage

4. `CLOSED` — D4 operator workflow consistency review
   - align `MCP_OPERATOR_MANUAL.md`, `OPERATIONS_DEPLOY.md`, and `LLM_IDIOT_PROOF_PROTOCOL_2026-05-04.md`
   - keep explicit distinction:
     - runtime change
     - repo-only docs/test change
     - restart required
     - reconnect required
   - result:
     - deploy pipeline is now described only for runtime changes
     - `repo_only` and `test_only` are explicitly exempt from manifest / deploy / restart / reconnect flow
     - reconnect is now described as required only when tool surface, descriptors, or schema handshake change

5. `CLOSED` — D5 decision gate for V7.2
   - decide whether V7.2 starts now, is postponed, or needs additional prerequisites
   - do not start V7.2 if docs/test/runtime consistency is still drifting
   - result:
     - V7.2 is POSTPONED for now
     - no confirmed runtime scaffold for `execution_context` exists yet beyond roadmap text
     - current higher-leverage work remains in the priority tooling track after D1-D4 closure
     - V7.2 should not start before:
       - a concrete `execution_context` contract is written
       - explicit tests for that contract are designed
       - there is a clear operator/runtime need stronger than the current tooling backlog

---

## PRIORITY TOOLING TRACK

Do not start this track before the D1-D4 consistency work is under control.

Priority order:

1. `CLOSED` — `project_truth_audit`
   - highest short-term leverage
   - compare runtime truth, docs truth, test truth, and deploy truth
   - outcome achieved: live MCP tool returns `status: ok` and `drifts: []`

2. `CLOSED` — `code_runtime_map`
   - map entrypoints, import graph, runtime-critical paths, legacy residue, and test-to-runtime coverage
   - outcome achieved: live MCP tool returns `status: ok` with entrypoints, module map, boundaries, legacy/staging markers, and test links

3. `CLOSED` — `deploy_decision_guard`
   - classify change as:
     - repo-only
     - test-only
     - runtime
     - runtime + client refresh
   - outcome achieved: live MCP tool returns `status: ok` and correct workflow decisions for repo-only and runtime-with-refresh cases

4. `change_workflow_simulator`
   - simulate the minimal safe validation/deploy/restart/reconnect sequence for a planned change
   - expected outcome: lower operator burden and clearer execution plans

5. stronger web/research tools
   - expand only after truth/audit/deploy discipline is stable
   - expected outcome: better research throughput without outrunning control

Deferred by design:

- `romioncoresim` bridge remains a later track
- RAG orchestration and internal agent/model-serving remain lower priority than the tools above

---

## FUTURE ARCHITECTURE GUARDRAILS

These principles are accepted into the workflow now, even where implementation is deferred:

1. Foundation before state
   - do not introduce RAG, internal agents, session state, or model routing before contracts, policy, audit, deploy truth, and test truth are stable

2. Local and auditable before clever
   - prefer local, deterministic, reversible, and auditable components over opaque convenience layers

3. Metadata discipline for future source systems
   - any later knowledge/retrieval layer should treat sources as first-class objects with:
     - stable identity
     - metadata
     - checksum or equivalent content signature
     - add / rewrite / delete lifecycle

4. Retrieval/state is a separate phase
   - vector stores, source monitoring, internal agent loops, and long-lived session memory are not "small additions"
   - they require a dedicated architecture phase after first-line tools are mature

5. New capability only after truth closes
   - new capability should follow closure of:
     - runtime truth
     - docs truth
     - test truth
     - deploy truth
