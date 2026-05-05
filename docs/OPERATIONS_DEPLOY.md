# Deploy Checklist MCP

Data: 2026-05-05
Status: current_reference
Zakres: deploy and runtime verification checklist dla zmian runtime; `repo-only` i `test-only` nie przechodzą przez deploy pipeline

## Change classes

| Change class | Deploy | Restart MCP | Refresh client |
|---|---:|---:|---:|
| `repo_only` | no | no | no |
| `test_only` | no | no | no |
| `runtime` | yes | yes | no |
| `runtime_with_client_refresh` | yes | yes | yes |

For `repo_only` and `test_only` changes:

- skip `.mcp_warzone`
- skip manifest
- skip `deploy.ps1`
- validate locally as needed
- commit only after validation

## Pre

- staged change exists in `.mcp_warzone`
- manifest exists
- `node --check` passes for staged JavaScript files

## Deploy

- deploy Prepare
- deploy Execute
- npm test must pass

## Post

- restart MCP tools profile
- refresh client connector if tool descriptors, tool surface, or schema handshake changed

## Runtime verification

Required baseline:

- plan read returns plan_ready
- plan mcp_apply returns blocked

Changed tools must also be invoked directly after restart.

## Optional

- rollback dry-run
- rollback execute

## Completion

Only after tests and runtime verification:

- commit
- push
