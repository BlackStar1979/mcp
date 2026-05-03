# MCP REGISTRY → WEB TOOLS → CONTROLLED EXECUTION ROADMAP

Data: 2026-05-03
Status: current_plan
Zakres: bezpieczna ewolucja MCP od registry plan-only do controlled execution z etapem web_tools

---

## CURRENT STATE (CONFIRMED)

Stage: V6 closed

- registry: DONE
- policy: DONE
- preflight: DONE
- plan: DONE
- outputSchema: DONE for all registry tools
- runtime verification: DONE
- dispatch: NOT DEPLOYED
- execution: NOT DEPLOYED

Current model:

```text
MCP tools surface
  -> registry control-plane
  -> preflight / plan
  -> no dispatch
  -> no execution
```

This is intentional. The system is currently safe, read-only at registry level, and side-effect free for registry operations.

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

---

## COLLISION ANALYSIS

### Collision 1 — dispatch before enforcement

Problem:

Dispatch without audit, anomaly influence, and critical-path policy would create an unsafe pseudo-execution layer.

Decision:

Do not introduce dispatch as the next step.

Resolution:

Insert V7 as audit/enforcement hardening before dispatch.

---

### Collision 2 — execution before global decision model

Problem:

Execution can create side effects. Multi-step operation without one global decision risks partial execution and inconsistent state.

Decision:

Execution is blocked until a global decision model exists.

Resolution:

Add V7.5 before controlled execution.

---

### Collision 3 — registry scaling vs single-tool registry

Problem:

Current registry has only one logical tool: `code_analysis`. Moving directly to dispatch would test execution before testing registry scalability.

Decision:

V6.5 must add a small read-only tool family first.

Resolution:

Use `web_tools_v1` as the next safe expansion.

---

### Collision 4 — web access vs open-world risk

Problem:

Web tools can leak data, fetch unbounded content, follow redirects into unsafe targets, or become a general browser.

Decision:

Web tools v1 must be allowlisted, read-only, bounded, no-auth, no-cookies, no writes, no disk downloads.

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

### V6.5 — Web tools v1 (NEXT)

Goal:

Add a small, read-only, bounded web intelligence surface useful for MCP development and ROMION projects.

Initial tools:

- `http_get` — allowlisted GET only, bounded response, no auth
- `check_pypi_package` — package metadata lookup
- `check_npm_package` — package metadata lookup
- `fetch_github_file` — raw GitHub file fetch with bounds

Explicitly not included in v1:

- `download_docs`
- generic crawling
- recursive docs fetch
- unrestricted URLs
- authenticated requests
- writing fetched content to disk
- CVE aggregation beyond one vetted source

Safety constraints:

- GET only
- allowlist domains only
- timeout enforced
- max response bytes enforced
- no cookies
- no credentials
- no redirects to non-allowlisted domains
- structuredContent first
- outputSchema required
- readOnlyHint true
- openWorldHint true

Entry conditions:

- current registry state remains green
- tests pass

Exit conditions:

- tools registered in connector-safe profile
- tests pass
- MCP restart succeeds
- client refreshed
- at least one runtime call per tool succeeds

---

### V7 — Audit and enforcement hardening

Goal:

Prepare the system for dispatch without enabling dispatch.

Scope:

- decision audit verification
- policy critical-path checks
- anomaly signals must affect allow/block decisions
- explicit test for no execution if audit is unavailable

Dispatch remains disabled.

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

Implement V6.5 in the smallest deployable slice:

```text
web_tools_v1a = http_get + check_pypi_package
```

No dispatch.
No execution.
No downloads to disk.
