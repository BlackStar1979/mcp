# Registry Runtime Design v1

Status: design baseline for next implementation phase.
Date: 2026-05-02
Scope: connector-safe registry runtime, without code mutation.

## 1. Problem

The repository already contains a registry layer:

- `core/registry/tool_registry.json`
- `core/registry/tool_registry.schema.json`
- `core/registry/registry.js`
- `core/registry/dispatch.js`
- `core/registry/dsl_validator.js`
- `core/registry/validate_registry.js`
- `core/registry/schemas/code_analysis_dsl.json`
- `core/registry/schemas/code_analysis_output.json`

However, this layer is not currently exposed through the connector-safe MCP profile. The full exposure exists only in `core/code_tools.js`, which must not be restored as the public connector runtime surface.

The current DSL also contains `apply_patch`, which is not acceptable for the first connector-safe registry runtime.

## 2. Design decision

Registry v1 will be read-only / plan-only.

Allowed operations:

- `symbols`
- `dependencies`
- `audit`
- `impact`
- `scenario`
- `patch_plan`
- `orchestrate`

Blocked operations:

- `apply_patch`
- any operation that writes project files
- any operation that uses network access
- any operation that executes shell commands

## 3. Runtime principle

Do not expose `core/code_tools.js`.

Create a new connector-safe module:

```text
core/registry_tools_safe.js
```

It will register safe MCP tools:

1. `tool_registry_status`
2. `tool_dispatch_readonly`

Both tools must use:

- structured audit logging,
- perf telemetry already provided by `server_tools.js`,
- trace ledger from `core/observability/trace.js`,
- schema validation from existing registry code.

## 4. Tool: tool_registry_status

Purpose: return validated registry metadata.

Properties:

- read-only,
- no filesystem mutation,
- no dispatch,
- safe for connector.

Output should include:

- registry status,
- registry version,
- registry id,
- enabled tools,
- operation policy summary.

## 5. Tool: tool_dispatch_readonly

Purpose: run selected registered tool operations through registry validation and trace, but only if operation is explicitly read-only/plan-only.

Input:

```json
{
  "tool": "code_analysis",
  "input": {
    "operation": "audit",
    "scope": "core",
    "target": "core/perf.js",
    "limits": {
      "recursive": true,
      "max_files": 500,
      "max_depth": 5,
      "direction": "both"
    }
  }
}
```

Guard sequence:

1. verify `tool` is enabled in registry,
2. verify `input.operation` is in allowlist,
3. reject `apply_patch` before DSL dispatch,
4. validate DSL,
5. dispatch through `dispatchRegisteredTool(...)`,
6. validate output,
7. write trace,
8. return trace id and result.

## 6. Required allowlist

Implementation constant:

```js
const READONLY_CODE_ANALYSIS_OPERATIONS = new Set([
  "symbols",
  "dependencies",
  "audit",
  "impact",
  "scenario",
  "patch_plan",
  "orchestrate",
]);
```

Any other operation must return a controlled error:

```json
{
  "status": "blocked",
  "reason": "operation_not_allowed_in_connector_safe_registry",
  "operation": "apply_patch"
}
```

## 7. Handler strategy

The safe registry module needs handlers for `code_analysis` operations.

Do not duplicate all logic manually if avoidable.

Preferred implementation route:

1. extract read-only code analysis primitives from `core/code_tools_safe.js` into a reusable module:
   - `core/code_analysis_engine.js`
2. make `core/code_tools_safe.js` register direct MCP tools using that engine,
3. make `core/registry_tools_safe.js` dispatch registry operations using the same engine.

This avoids two divergent implementations of dependency graph logic.

## 8. First implementation milestone

Minimal safe implementation may duplicate only a thin adapter if extraction is too large, but must still pass tests.

Milestone 1:

- add `core/registry_tools_safe.js`,
- expose `tool_registry_status`,
- expose `tool_dispatch_readonly`,
- support operations: `symbols`, `dependencies`, `audit`, `impact`,
- block `apply_patch`,
- register the module in `server_tools.js`,
- add tests.

Milestone 2:

- support `scenario`, `patch_plan`, `orchestrate` as plan-only,
- add stronger trace/audit assertions,
- add operator manual section.

## 9. Tests required

Add tests:

- registry validates current `tool_registry.json`,
- registry safe tool source contains allowlist,
- registry safe tool source rejects `apply_patch`,
- `server_tools.js` imports `registry_tools_safe.js`,
- `server_tools.js` still does not import full `code_tools.js` as registered tool surface,
- DSL still may contain `apply_patch`, but safe wrapper must block it.

## 10. Deployment strategy

All implementation changes go through current operational control plane:

1. prepare changed files in `.mcp_warzone`,
2. create manifest in `.mcp_deploy`,
3. `deploy.ps1 -Mode Prepare`,
4. `deploy.ps1 -Mode Execute`,
5. restart MCP,
6. run perf/audit checks,
7. commit to GitHub only after tests pass.

## 11. Non-goals for v1

Do not implement in this phase:

- code mutation,
- write-capable orchestration,
- automatic promotion,
- shell execution,
- network calls,
- RAG writes,
- self-modifying registry.

## 12. Acceptance criteria

Registry runtime v1 is accepted only if:

- `npm test` passes,
- MCP starts,
- `tool_registry_status` works,
- `tool_dispatch_readonly` works for read-only operations,
- `tool_dispatch_readonly` blocks `apply_patch`,
- perf logs redact token,
- audit logs include deployment trail,
- no full `code_tools.js` public registration is restored.


## 13. Implemented milestones

### Registry v1b — status-only

Status: implemented and validated in MCP connector.

Exposed tool:

- `tool_registry_status`

Properties:

- explicit empty input schema,
- read-only annotations,
- no dispatch,
- no mutation,
- connector accepted the descriptor.

### Registry v1c — list

Status: implemented and validated in MCP connector.

Exposed tool:

- `tool_registry_list`

Properties:

- explicit empty input schema,
- returns registry tool list,
- no dispatch,
- no mutation.

### Registry v2 — single-tool metadata

Status: implemented and validated in MCP connector.

Exposed tool:

- `tool_registry_get_tool`

Input:

```json
{
  "tool": "code_analysis"
}
```

Properties:

- explicit flat schema,
- returns metadata for a single tool,
- returns `not_found` for missing tools,
- no dispatch,
- no mutation.

### Registry v3 — validation-only

Status: implemented and validated in MCP connector.

Exposed tool:

- `tool_registry_validate_tool`

Input:

```json
{
  "tool": "code_analysis"
}
```

Output decision fields:

- `found`,
- `enabled`,
- `allowed`,
- `reason`.

Validation results confirmed:

- `code_analysis` -> `allowed: true`, `enabled: true`, `reason: null`,
- `missing_tool` -> `allowed: false`, `reason: tool_not_found`.

## 14. Next safe milestone

Next safe milestone should be Registry v4 policy detail, still without execution.

Candidate tool:

- `tool_registry_policy`

Purpose:

- return policy/runtime/sandbox/observability metadata for a validated tool,
- keep connector-safe boundaries,
- no dispatch,
- no DSL execution,
- no file mutation.

Rationale:

- this creates the policy layer required before any controlled dispatch,
- it keeps risk low while making runtime decisions explainable.
