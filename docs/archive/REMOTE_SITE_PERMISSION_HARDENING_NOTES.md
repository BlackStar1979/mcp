# Remote Site Permission Hardening — Engineering Notes

## Context

The deployed remote site logger foundation successfully created:

```text
/home/ubuntu/apps/romion-site/.mcp_site_ops/logs/site-files.log
```

Observed permissions:

```text
0666
```

This is not critical because:
- the file is outside webroot,
- the VPS is single-tenant,
- only VPS-local users can access it.

However, it violates operational hardening expectations.

## Root cause hypothesis

The file is created through SFTP append/write behavior.

Likely causes:
- server-side umask,
- SFTP client default create mode,
- append semantics creating file before chmod,
- no explicit permission correction after creation.

## Hardening goals

### Required

- prevent world-writable operational logs,
- keep logger functionality deterministic,
- avoid introducing shell execution,
- avoid introducing sudo usage,
- avoid arbitrary chmod surface.

### Preferred target mode

```text
0660
```

### Acceptable target modes

```text
0640
0664
```

## Architectural options

### Option A — SFTP chmod after create

Flow:

```text
append/write -> detect creation -> chmod(targetMode)
```

Advantages:
- self-contained runtime,
- deterministic,
- no VPS-side manual intervention.

Risks:
- SFTP chmod compatibility,
- race conditions on append,
- additional SFTP operation overhead,
- partial behavior differences between servers.

## Option B — One-time VPS correction

Flow:

```text
manual chmod/chgrp on VPS
```

Advantages:
- simplest,
- operationally deterministic.

Risks:
- not self-healing,
- future files may inherit weak permissions again.

## Option C — Directory inheritance model

Flow:

```text
setgid dirs + controlled umask
```

Advantages:
- operationally clean.

Risks:
- larger VPS-level policy change,
- outside current MCP bounded scope.

## Recommended direction

Recommended immediate direction:

```text
Option A
```

with fallback:

```text
Option B
```

if SFTP chmod proves unreliable.

## Additional future recommendation

Potential future logger artifact modes:

```text
logs/*.log   -> 0660
meta/*.json  -> 0660
trash/*      -> 0640
edits/*      -> 0640
```

## Explicit non-goals

This stage should NOT introduce:
- generic chmod tool,
- generic chown tool,
- generic shell execution,
- arbitrary remote permissions management.

## Next implementation step

Implement logger-side permission normalization helper in staging runtime and test against VPS.
