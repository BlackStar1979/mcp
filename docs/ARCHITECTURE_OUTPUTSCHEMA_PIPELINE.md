# OutputSchema Rollout Pipeline

Data: 2026-05-03
Status: current_reference
Zakres: controlled outputSchema rollout pipeline for registry tools

## Rule

outputSchema is a runtime-sensitive contract change. Static tests are not enough. Every rollout requires deploy and runtime verification.

## Pipeline

1. Prepare the change in .mcp_warzone.
2. Run node --check on staged JavaScript files.
3. Run deploy Prepare with a manifest.
4. Run deploy Execute with the same manifest.
5. Require npm test to pass.
6. Restart server_tools.js.
7. Invoke the changed MCP tool through the connector.
8. Roll back immediately if runtime output is not expected.

## Registry baseline

- plan read must return plan_ready
- plan mcp_apply must return blocked
- dispatch must remain disabled
- execution must remain disabled where present

## Forbidden schema patterns

- broad any-like schemas
- unknown-like schemas
- record-like dynamic maps
- union-based output schemas unless runtime-proven safe
- dynamic broad result objects

## Required schema style

- explicit fields
- deterministic output shape
- flat schema where practical
- direct test coverage
- real runtime invocation after restart

## Completion rule

A rollout is complete only after tests and runtime verification both pass.
