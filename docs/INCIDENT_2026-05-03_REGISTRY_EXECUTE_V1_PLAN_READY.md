# INCIDENT: registry_execute_v1 plan_ready contract mismatch

Date: 2026-05-03
Status: resolved
Severity: medium
Area: registry control-plane / execution simulation

---

## Summary

During the first rollout of `tool_registry_execute` (V7.0), runtime verification detected an inconsistent result for a valid read operation.

Input:

```json
{ "tool": "code_analysis", "operation": "read" }
```

Incorrect output:

```json
{
  "status": "plan_ready",
  "allowed": true,
  "plan_ready": false,
  "steps_count": 0,
  "dispatch_enabled": false,
  "execution_enabled": false,
  "simulated_execution": true
}
```

This was internally contradictory: status indicated that a plan was ready, while `plan_ready` was false and no simulated steps were returned.

---

## Expected Output

For a valid read operation, `tool_registry_execute` must return:

```json
{
  "status": "simulated",
  "allowed": true,
  "plan_ready": true,
  "steps_count": 5,
  "dispatch_enabled": false,
  "execution_enabled": false,
  "simulated_execution": true
}
```

---

## Root Cause

`executeDecision()` checked only:

```js
if (plan.plan_ready !== true)
```

but the successful branch of `planDecision()` returned:

```js
status: "plan_ready"
```

without explicitly setting:

```js
plan_ready: true
```

Therefore, a valid plan was treated as not ready by the execution simulation layer.

---

## Contributing Factor

The V6 plan contract relied on status semantics (`status: "plan_ready"`) more strongly than on the explicit boolean field (`plan_ready`).

This was acceptable for V6 plan-only behavior, but became unsafe when V7 execution simulation consumed the V6 result as an input contract.

---

## Secondary Operational Issue

During rollback, the first rollback command targeted the wrong deployment id:

- rolled back: `web_tools_v1c_json_fix`
- intended rollback: `registry_execute_v1`

Effect:

- `tool_registry_execute` remained active until the correct deployment id was identified
- `web_tools_v1c` JSON parsing fix was temporarily reverted

Resolution:

1. Correct rollback was executed for `registry_execute_v1`
2. `web_tools_v1c_json_fix` was redeployed
3. `registry_execute_v1` was fixed and redeployed

---

## Fix

Two changes were made intentionally:

### 1. Make plan success explicit

Successful plan now returns:

```js
plan_ready: true
```

### 2. Harden execution simulation gate

Execution simulation now checks:

```js
if (plan.status !== "plan_ready")
```

instead of relying only on the boolean flag.

This creates redundant consistency:

- `status: "plan_ready"`
- `plan_ready: true`

Both must describe the same state.

---

## Regression Test Added

A test was added to ensure that the success path contains:

```js
plan_ready: true
```

The V7 test suite also verifies that `tool_registry_execute` remains simulation-only:

- no dispatch
- no real execution
- no filesystem writes
- no process execution

---

## Runtime Verification After Fix

### Valid read

```json
{ "tool": "code_analysis", "operation": "read" }
```

Result:

```text
status: simulated
allowed: true
plan_ready: true
steps_count: 5
dispatch_enabled: false
execution_enabled: false
```

### Blocked write/mutation operation

```json
{ "tool": "code_analysis", "operation": "mcp_apply" }
```

Result:

```text
status: blocked
allowed: false
reason: operation_not_allowed
```

### Missing tool

```json
{ "tool": "missing_tool", "operation": "read" }
```

Result:

```text
status: not_found
allowed: false
reason: tool_not_found
```

---

## Lessons Learned

### 1. Runtime verification is mandatory

The static tests passed, but runtime verification detected the contract mismatch.

Conclusion:

```text
Tests prove structure. Runtime verifies behavior.
```

---

### 2. Do not depend on one signal when a state is critical

For critical state transitions, use redundant explicit state:

```text
status + boolean flag
```

Both must agree.

---

### 3. Rollback must target the exact deployment id

Never infer deployment id from memory.

Before rollback:

1. identify exact `EXECUTED:` record
2. confirm manifest purpose
3. rollback only that id

---

### 4. Restore baseline before continuing

If an accidental rollback affects an earlier fix, restore that baseline before continuing new work.

This was done for `web_tools_v1c_json_fix` before retrying V7.

---

### 5. Execution-adjacent code needs stricter contracts

Even simulation-only execution is execution-adjacent. It must be treated with higher strictness than read-only metadata tools.

---

## Current Status

Resolved and committed.

Current V7 behavior:

```text
tool_registry_execute: deployed
mode: simulation-only
dispatch_enabled: false
execution_enabled: false
runtime verified: yes
```

---

## Follow-up

Before V8 real dispatch or execution, implement V7.1 Execution Safety Layer:

- execution token
- plan binding / plan hash
- audit enforcement
- explicit execution mode separation
- anti-replay protection

Real execution remains blocked until V7.1 is complete and runtime verified.
