# REGISTRY — CURRENT STATE

Data: 2026-05-05
Status: current_reference
Zakres: wąska referencja tematyczna dla aktywnego control-plane registry; nie zastępuje canonical docs opisujących cały bieżący runtime

## Ważne

Ten dokument pozostaje aktualną referencją dla rodziny `tool_registry_*`, ale nie powinien być czytany jako nadrzędny source-of-truth dla całego runtime MCP.

Czytaj razem z:

1. `docs/CURRENT_STATE.md`
2. `docs/RUNTIME_CONTRACTS_CURRENT.md`
3. `docs/DOCS_CATALOG.md`

Aktualna reguła interpretacyjna:

- ten plik opisuje tylko control-plane registry
- canonical runtime boundaries, workflow deploy i szersze reguły operacyjne mają pierwszeństwo w canonical docs
- jeśli pojawi się rozjazd między tym plikiem a canonical docs, rozstrzygające są canonical docs i aktywny runtime path

## Runtime model

Registry jest dziś control-plane dla zarejestrowanych narzędzi logicznych.

Aktualny registry:

- `registry_id`: `romion-core`
- `version`: `v1.0.0`
- zarejestrowane narzędzie logiczne: `code_analysis`

Registry pozostaje:

- connector-safe
- no-dispatch
- no real execution
- simulation-only dla `tool_registry_execute`
- plan-driven

## Exposed registry tools

| MCP tool | Status | Dispatch | Real execution | Notes |
|---|---:|---:|---:|---|
| `tool_registry_status` | active | no | no | registry summary |
| `tool_registry_list` | active | no | no | tool list + policy metadata |
| `tool_registry_get_tool` | active | no | no | flat metadata lookup |
| `tool_registry_validate_tool` | active | no | no | availability decision |
| `tool_registry_policy` | active | no | no | policy/runtime details |
| `tool_registry_preflight` | active | no | no | operation allow/block decision |
| `tool_registry_execute` | active | no | no | simulation-only execution envelope |
| `tool_registry_plan` | active | no | no | deterministic plan-only output |

## OutputSchema coverage and live verification

| Tool | OutputSchema | Live MCP verified 2026-05-05 |
|---|---:|---:|
| `tool_registry_status` | DONE | YES |
| `tool_registry_list` | DONE | YES |
| `tool_registry_get_tool` | DONE | YES |
| `tool_registry_validate_tool` | DONE | YES |
| `tool_registry_policy` | DONE | YES |
| `tool_registry_preflight` | DONE | YES |
| `tool_registry_execute` | DONE | YES |
| `tool_registry_plan` | DONE | YES |

## Runtime verification baseline

Confirmed live health checks on 2026-05-05:

```text
tool_registry_status() -> status: ok, dispatch_enabled: false
tool_registry_list() -> status: ok, tool_count: 1
tool_registry_get_tool("code_analysis") -> status: ok, found: true
tool_registry_get_tool("missing_tool_probe") -> status: not_found, found: false
tool_registry_validate_tool("code_analysis") -> status: ok, allowed: true
tool_registry_policy("code_analysis") -> status: ok, found: true
tool_registry_policy("missing_tool_probe") -> status: not_found, found: false
tool_registry_preflight("code_analysis", "read") -> status: ok, allowed: true
tool_registry_preflight("code_analysis", "mcp_apply") -> status: ok, allowed: false, reason: operation_not_allowed
tool_registry_plan("code_analysis", "read") -> status: plan_ready
tool_registry_plan("code_analysis", "mcp_apply") -> status: blocked
tool_registry_execute("code_analysis", "read") -> status: simulated
tool_registry_execute("missing_tool_probe", "read") -> status: not_found
tool_registry_execute("code_analysis", "read", execution_mode="real") -> status: blocked, reason: execution_not_enabled
```

Note:

- `tool_registry_execute("code_analysis", "mcp_apply")` remains inferably blocked by the same policy boundary, but this exact call was not re-run in the 2026-05-05 live verification pass above.
- "Live MCP verified" here means manual invocation through the active MCP runtime, not an automated end-to-end runtime test in `npm test`.

Expected safety flags:

```text
dispatch_enabled: false
execution_enabled: false
simulated_execution: true only for simulation path
```

## OutputSchema rules

Forbidden in registry outputSchema:

- `z.any()`
- `z.unknown()`
- `z.record()`
- `z.union()` until explicitly runtime-proven safe
- dynamic broad objects

Required:

- explicit fields
- deterministic shape
- flat schema where practical
- runtime verification after deploy

## Deployment rule

Every registry contract change must follow:

1. stage in `.mcp_warzone`
2. `node --check` on staged file
3. deploy Prepare
4. deploy Execute
5. `npm test`
6. MCP restart
7. runtime invocation of changed tool
8. rollback if runtime output is not as expected

## Important boundary

`tool_registry_execute` is not permission to introduce real execution.

Current meaning:

- deterministic simulation
- no dispatch
- no filesystem writes
- no project mutation
- no network calls through registry execution path

If a future document claims real execution is active, it must be treated as false until confirmed in:

- `server_tools.js`
- `core/registry_tools_safe.js`
- tests
- runtime verification after deploy
