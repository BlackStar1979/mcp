# MCP Workstream — Remote Site Ops Logger Foundation

## Status

Accepted.

Implementation planning stage opened.

## Purpose

Introduce a structured operational logging foundation for bounded remote VPS tooling before implementing restore lifecycle operations.

This workstream establishes:
- auditability,
- lifecycle traceability,
- restore diagnostics,
- future prune compatibility,
- runtime introspection support.

## Architectural decision

Logging becomes the foundational lifecycle layer.

Reasoning:
- restore without logs weakens recovery diagnostics,
- prune without logs weakens governance,
- runtime status without logs weakens observability.

Accepted order:

```text
logging -> restore -> prune -> runtime status
```

## Planned runtime additions

### remote_site_ops_logger.js

Shared helper module for bounded remote tooling.

Responsibilities:
- append JSONL events,
- normalize timestamps,
- normalize event schema,
- enforce safe serialization,
- support bounded event payloads,
- create required ops directories when missing.

## Planned remote ops structure

Under:

```text
/home/ubuntu/apps/romion-site/.mcp_site_ops
```

Expected directories:

```text
trash/
edits/
logs/
meta/
```

Bootstrap should be automatic and idempotent.

## Planned log file

```text
/home/ubuntu/apps/romion-site/.mcp_site_ops/logs/site-files.log
```

Format:

```text
JSONL
```

## Minimum event schema

```json
{
  "ts": "2026-05-09T21:00:00Z",
  "operation": "write",
  "actor": "gpt-mcp",
  "remote_path": "index.html",
  "result": "success",
  "artifact": null,
  "details": {}
}
```

## Initial integration scope

Operations to instrument first:

```text
write
edit
delete
move
```

Read/list may remain optional initially.

## Planned future compatibility

Logger design should support:
- restore lifecycle,
- prune lifecycle,
- runtime status reporting,
- artifact integrity metadata,
- future operational analytics.

## Restore model guidance

Restore should later use:

```text
artifact id / metadata manifest
```

instead of:

```text
raw path-only restore
```

Suggested metadata:

```json
{
  "trash_id": "20260509T210001Z_index_html_delete",
  "original_path": "index.html",
  "stored_path": "trash/...",
  "sha256": "..."
}
```

## Governance constraints

Still forbidden:
- shell execution,
- sudo execution,
- Docker control,
- nginx reloads,
- arbitrary filesystem traversal.

## MCP deployment requirements

Implementation must continue using:

```text
.mcp_warzone
```

with:

```text
deploy.ps1
rollback.ps1
```

Direct runtime patching remains prohibited.

## Runtime integration progress

Completed in staging:
- inline remote logger helpers removed from `remote_site_tools.js`
- centralized logger runtime introduced through `remote_site_ops_logger.js`
- all remote site operations now use shared `appendRemoteSiteOpsLog(...)`
- `withSftp()` now automatically bootstraps `.mcp_site_ops` using `ensureRemoteSiteOpsDirs(...)`
- logging runtime remains fully outside public webroot

Current staging state:
- no deployment executed
- runtime production untouched
- logger lifecycle prepared for retention and restore integration
- remaining work limited to contract tests, prune lifecycle, and smoke validation

## Validation expectations

Before deployment:
- stage-only validation,
- node syntax checks,
- targeted logger tests,
- bounded payload tests.

After deployment:
- npm test,
- MCP runtime restart,
- connector refresh verification,
- controlled write/edit/delete operation tests,
- log verification inside opsRoot.
