# MCP Stage — Remote Site Hardening Completion

## Status

Accepted and opened.

## Purpose

Complete lifecycle governance for bounded MCP↔VPS remote site tools before introducing broader VPS capability layers.

## Current baseline

The MCP runtime already exposes bounded remote site tools over SFTP:

```text
list_remote_site_files
read_remote_site_file
write_remote_site_file
edit_remote_site_file
move_remote_site_file
delete_remote_site_file
```

Logger foundation has been deployed and verified:

```text
core/remote_site_ops_logger.js
core/remote_site_tools.js
```

Current production test suite:

```text
PASS 119/119
```

## Current known gaps

### Permission hardening

Observed on VPS:

```text
/home/ubuntu/apps/romion-site/.mcp_site_ops/logs/site-files.log -> 0666
```

Target:

```text
0640 / 0660 / 0664, depending on final group model
```

### Restore lifecycle

Missing runtime tool:

```text
restore_remote_site_file
```

### Metadata lineage

Current artifacts do not yet have durable operation metadata under:

```text
/home/ubuntu/apps/romion-site/.mcp_site_ops/meta
```

### Retention contract

Retention values exist in config:

```text
retentionCount
retentionDays
```

but prune behavior is not yet implemented.

### Canonical schema

Existing log file contains both legacy and canonical entries.

Future canonical schema should include:

```text
schema_version
operation_id
correlation_id
operation
actor
remote_path
result
artifact
details
```

## Implementation order

1. Permission hardening decision and minimal fix.
2. Logger schema evolution with operation IDs.
3. Restore metadata model.
4. `restore_remote_site_file` runtime implementation.
5. Retention/prune contract.
6. Smoke tests against VPS.
7. Documentation closure.

## Governance constraints

Still forbidden:
- generic SSH shell,
- sudo,
- Docker control,
- nginx control,
- systemd control,
- VPN orchestration,
- arbitrary VPS filesystem access.

All MCP runtime changes must be staged through:

```text
C:\Work\mcp\.mcp_warzone
```

and deployed through:

```text
deploy.ps1
rollback.ps1
```

## Immediate next step

Start with permission hardening evaluation and then implement restore foundation in staging.
