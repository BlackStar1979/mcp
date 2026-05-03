# Deploy Checklist MCP

Data: 2026-05-03
Status: current_reference
Zakres: deploy and runtime verification checklist

## Pre

- staged change exists in .mcp_warzone
- manifest exists
- node --check passes for staged JavaScript files

## Deploy

- deploy Prepare
- deploy Execute
- npm test must pass

## Post

- restart MCP tools profile
- refresh client connector if tool descriptors changed

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
