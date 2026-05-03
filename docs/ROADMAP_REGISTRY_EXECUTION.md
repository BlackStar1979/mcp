# MCP REGISTRY → WEB TOOLS → CONTROLLED EXECUTION ROADMAP

Data: 2026-05-03
Status: current_plan
Zakres: bezpieczna ewolucja MCP od registry plan-only do controlled execution z etapem web_tools

---

## CURRENT STATE (CONFIRMED)

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
