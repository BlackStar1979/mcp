# Remote Site Tools Plan

Data: 2026-05-12
Status: current_reference
Zakres: plan bounded remote VPS site file tools for local MCP runtime

## Objective

Enable the local MCP runtime to safely perform bounded remote file operations on the ROMION VPS public site content.

The implementation must:
- preserve the current MCP deploy/rollback workflow,
- avoid arbitrary remote shell execution,
- avoid broad VPS access,
- maintain rollbackability and auditability,
- keep blast radius intentionally small.

## Cross-project dependency

This plan depends on synchronized VPS-side documentation in:

```text
C:\Work\www
```

Especially:

```text
vps.md
remote-site-tools-roadmap.md
remote-site-tools-progress.md
```

The VPS project defines:
- allowed remote paths,
- operational storage paths,
- retention expectations,
- operational constraints.

## Runtime workflow constraints

This feature MUST follow:

```text
.mcp_warzone -> validate -> deploy.ps1 -> restart -> verify -> rollback
```

Direct modification of:

```text
C:\Work\mcp\core
```

is forbidden.

## Selected transport

Accepted:

```text
SFTP over SSH
```

Selected library candidate:

```text
ssh2-sftp-client
```

Reasoning:
- bounded file operations,
- simpler control surface,
- lower blast radius than shell execution,
- simpler rollback semantics,
- no arbitrary command execution.

## Explicitly rejected architecture

Rejected:

```text
generic SSH shell execution
```

Reason:
- excessive blast radius,
- difficult auditing,
- path control becomes weaker,
- future privilege escalation risk.

## Allowed VPS scope

Public content root:

```text
/home/ubuntu/apps/romion-site/html
```

Private operational root:

```text
/home/ubuntu/apps/romion-site/.mcp_site_ops
```

Anything outside these paths must be blocked.

## Planned tool surface v1

```text
list_remote_site_files
read_remote_site_file
write_remote_site_file
edit_remote_site_file
move_remote_site_file
delete_remote_site_file
restore_remote_site_file
```

## Planned operational semantics

### delete_remote_site_file

No hard delete.

Behavior:

```text
move original -> trash/
write audit log
```

### move_remote_site_file

Behavior:

```text
move source -> target
write audit log
```

v1 restriction:

```text
overwrite forbidden
```

### edit_remote_site_file / write_remote_site_file

Behavior:

```text
read previous version
generate diff
store diff artifact
write replacement content
write audit log
```

## Planned operational storage

```text
.mcp_site_ops/trash
.mcp_site_ops/edits
.mcp_site_ops/logs
```

## Planned logging

Target:

```text
site-files.log
```

All operations must be logged.

## Planned retention baseline

Initial proposal:

```text
retain last 20 artifacts per file
max age 30 days
```

Applies to:
- trash artifacts,
- diff artifacts.

## Security constraints

Mandatory:

```text
fixed remote root
POSIX normalization
no path traversal
no arbitrary absolute paths
allowed extensions only
max file size
no shell
no sudo
no Docker
no nginx reload
```

## VPS configuration model

VPS configuration must not be hardcoded in runtime.

Selected direction:
- tool input provides configuration reference,
- tool validates configuration existence and connectivity,
- tool blocks execution if validation fails.

Failure result:

```text
status: blocked
reason: no_valid_vps_access_config
```

## Planned implementation direction

Expected staging area:

```text
C:\Work\mcp\.mcp_warzone
```

Likely future implementation areas:

```text
remote site tools module
runtime registration updates
validation additions
contract updates
```

A bounded runtime implementation now exists in working tree and is registered by active `server_tools.js` local runtime. This document remains the architectural plan/source of constraints, not a claim of VPS production-readiness.

## Current state classification

Status today:

```text
Design/documentation only.
No runtime deployment.
No staged runtime files yet.
```

