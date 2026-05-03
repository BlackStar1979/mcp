# REGISTRY — CURRENT STATE

Data: 2026-05-03  
Status: current_reference  
Zakres: registry tools, outputSchema coverage, runtime verification status

## Runtime model

Registry jest obecnie control-plane dla zarejestrowanych narzędzi logicznych, nie pełnym katalogiem exposed MCP actions.

Aktualny registry:

- `registry_id`: `romion-core`
- `version`: `v1.0.0`
- zarejestrowane narzędzie logiczne: `code_analysis`

Registry pozostaje:

- read-only,
- connector-safe,
- no-dispatch,
- no-execution,
- plan-driven.

## Exposed registry tools

| MCP tool | Status | Dispatch | Notes |
|---|---:|---:|---|
| `tool_registry_status` | active | no | registry summary |
| `tool_registry_list` | active | no | tool list + policy metadata |
| `tool_registry_get_tool` | active | no | flat metadata lookup |
| `tool_registry_validate_tool` | active | no | availability decision |
| `tool_registry_policy` | active | no | policy/runtime details |
| `tool_registry_preflight` | active | no | operation allow/block decision |
| `tool_registry_plan` | active | no | deterministic plan-only output |

## OutputSchema coverage

| Tool | OutputSchema | Runtime verified |
|---|---:|---:|
| `tool_registry_status` | DONE | YES |
| `tool_registry_list` | DONE | YES |
| `tool_registry_get_tool` | DONE | YES |
| `tool_registry_validate_tool` | DONE | YES |
| `tool_registry_policy` | DONE | YES |
| `tool_registry_preflight` | DONE | YES |
| `tool_registry_plan` | DONE | YES |

## Runtime verification baseline

Required health checks:

```text
tool_registry_get_tool("code_analysis") -> status: ok, found: true
tool_registry_get_tool("missing_tool_probe") -> status: not_found, found: false
tool_registry_plan("code_analysis", "read") -> status: plan_ready
tool_registry_plan("code_analysis", "mcp_apply") -> status: blocked
```

Expected safety flags:

```text
dispatch_enabled: false
execution_enabled: false where present
```

## OutputSchema rules

Forbidden in registry outputSchema:

- `z.any()`
- `z.unknown()`
- `z.record()`
- `z.union()` until explicitly runtime-proven safe
- dynamic broad objects

Required:

- explicit fields,
- deterministic shape,
- flat schema where practical,
- runtime verification after deploy.

## Deployment rule

Every outputSchema change must follow:

1. `node --check` on staged file,
2. deploy Prepare,
3. deploy Execute,
4. `npm test` pass,
5. MCP restart,
6. runtime invocation of changed tool,
7. rollback if runtime output is not as expected.
