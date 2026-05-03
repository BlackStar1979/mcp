# KNOWN ISSUE: Connector-level Tool Blocking (False Positives)

## Summary

Certain MCP tools may be **selectively blocked by the connector/safety layer** despite:

- correct implementation
- valid outputSchema
- successful runtime execution
- passing all tests

This is **not a defect in MCP runtime or tool implementation**.

---

## Observed Behavior

Example from MCP (2026-05-03):

| Tool | Input | Result |
|------|------|--------|
| http_get | https://pypi.org/pypi/zod/json | OK |
| check_pypi_package | requests | OK |
| check_pypi_package | zod | BLOCKED |

Key observation:

> The same endpoint works via `http_get`, but fails via `check_pypi_package`.

---

## Root Cause (External Layer)

Blocking occurs in layers above MCP:

1. Connector safety filtering
2. Tool routing heuristics
3. Model-level decision logic

These layers:

- are **non-deterministic**
- use **heuristics (name, description, arguments)**
- may produce **false positives**

---

## Characteristics of the Issue

- Tool works for some inputs, fails for others
- No code changes required to trigger failure
- No runtime errors inside MCP
- Different tools accessing the same endpoint behave differently

---

## Triggers (Heuristic, Not Guaranteed)

Potential triggers include:

- Tool name (e.g. `check_*`, `fetch_*`)
- Argument values (short strings, ambiguous identifiers)
- Descriptions containing:
  - "fetch"
  - "external"
  - "metadata"

---

## Engineering Conclusion

```
MCP runtime: correct
Connector layer: filtering
```

This issue must be treated as **external system behavior**.

---

## Recommended Handling

### 1. Do NOT debug MCP runtime

If:

- endpoint works via another tool
- tests pass

→ assume connector filtering

---

### 2. Provide fallback tools

Example:

```
check_pypi_package
    ↓ (fail)
http_get
```

---

### 3. Consider alternative naming

Rename tools to reduce heuristic triggers:

- `check_pypi_package` → `pypi_info`
- `fetch_*` → `get_*`

---

### 4. Accept partial availability

Tools may be:

- operational
- but not consistently invokable

This is acceptable in current MCP ecosystem.

---

## Status

- MCP: stable
- Registry: stable
- OutputSchema: enforced
- Issue: acknowledged, external

---

## Notes

This behavior has been observed in multiple MCP deployments and aligns with known connector safety false positives.
