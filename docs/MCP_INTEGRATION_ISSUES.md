# MCP INTEGRATION ISSUES (CURATED)

Status: aktywne zasady runtime
Cel: szybkie przypomnienie realnych problemów i reguł — bez historii, bez szumu

---

## CORE PRINCIPLE

System = tylko to, co jest egzekwowane w runtime

---

## 1. IO / DATA CHANNEL

### ISSUE
Agent ignoruje `content`, używa `structuredContent`

### RULE-IO-001
Dane dla agenta → structuredContent

---

## 2. PATH / ENV

### ISSUE
CWD i URL.pathname psują ścieżki (Windows)

### RULE-ENV-001
Nigdy nie polegać na CWD

### RULE-ENV-002
Używać fileURLToPath, nie URL.pathname

---

## 3. WRITE SAFETY

### ISSUE
Ryzyko nadpisania plików

### RULE-EDIT-001
Zawsze preflight (read → patch → verify)

### RULE-EDIT-002
Brak testów write na realnych plikach

---

## 4. POLICY / CONTROL

### ISSUE
Policy istniał, ale nie działał

### RULE-RUNTIME-001
"Enforced" tylko jeśli w write path

---

## 5. ANOMALY

### ISSUE
Detekcja bez wpływu = brak detekcji

### RULE-RUNTIME-003
Anomaly musi zmieniać decyzję

---

## 6. ORCHESTRATION

### ISSUE
Brak globalnej kontroli planu

### RULE-RUNTIME-004
Multi-step → jedna decyzja

---

## 7. AUDIT

### ISSUE
Brak śladu decyzji

### RULE-AUDIT-001
Każda decyzja musi być zapisana

---

## 8. FEEDBACK

### ISSUE
System nie uczy się

### RULE-ADAPT-001
Feedback musi wpływać na risk

---

## 9. RECOVERY

### ISSUE
Recovery było deklaratywne

### RULE-RUNTIME-002
Recovery przed startem systemu

### RULE-STARTUP-001
Brak recovery → brak startu

---

## 10. DEPLOY

### ISSUE
Manualny, niekontrolowany deploy

### RULE-DEPLOY-001
Deploy = validated + backup + verify

---

## 11. INTEGRATION GAP

### ISSUE
Kod istnieje, ale nie jest używany

### RULE-INTEGRATION-001
Kod nieużywany = nie istnieje

---

## 12. PIPELINE

### ISSUE
Brak wymuszonej kolejności

### RULE-PIPELINE-001
validate → execute → audit → rollback

---

## 13. PROMOTION / DEPLOY MANIFEST

### ISSUE
Deploy może kopiować pliki, których nie obejmuje manifest promotion gate

### RULE-DEPLOY-002
Każdy plik kopiowany do runtime musi być uwzględniony w manifest hash promotion_gate

---

## TL;DR (operacyjne)

✔ wszystko musi być w critical path
✔ wszystko musi być zapisane
✔ wszystko musi być odwracalne
✔ brak założeń — tylko egzekucja


---

## 2026-05-01 — ChatGPT Connector failure: unsafe tool surface, wrong diagnostic path

### Incident
ChatGPT Connector creation failed with generic UI error:

```txt
Błąd podczas tworzenia łącznika
Something went wrong
```

The MCP endpoint, local port, Cloudflare tunnel, and `/mcp` routing were functional. Manual curl confirmed the public Cloudflare URL reached the local MCP server.

### Actual root cause
The blocking condition was the exposed MCP tool surface, specifically the full `registerCodeTools(server)` group from `code_tools.js`.

Connector-hosted MCP must not expose unsafe or agentic tools. The unsafe surface included:

- state-changing tools: `code_apply_patch`, `code_rollback_patch`
- dynamic dispatcher: `tool_dispatch`
- open schemas such as `z.record(z.any())`
- direct execution/system surface via `execFile`
- patching / rollback / self-modifying workflow

The Connector failed silently with a generic error instead of returning a useful validation error.

### Incorrect diagnostic path
The assistant incorrectly focused on:

- auth/query token
- GET vs POST
- Cloudflare tunnel/routing
- SSE/Streamable HTTP transport

This delayed root-cause isolation. The correct first diagnostic path should have been tool-surface minimization and binary search.

### Correct fix
Do not attempt to make full `code_tools.js` connector-safe. Split the runtime profile:

- full/dev MCP: may expose full operational tools only in controlled context
- ChatGPT Connector MCP: must expose connector-safe read-only tools only

Use `code_tools_safe.js` for connector exposure. Allowed examples:

- `code_symbols`
- `code_dependencies`
- `code_audit`
- `code_impact`

Forbidden in connector profile:

- file mutation / patch / rollback
- `child_process` / `execFile`
- dynamic dispatch
- `z.any()` / open-ended schemas
- non-deterministic or agentic/self-modifying operations

### New mandatory workflow
For any Connector failure:

1. Start from minimal MCP server with one deterministic read-only tool.
2. Add tool groups incrementally.
3. Binary-search the blocking tool group.
4. Validate schemas and annotations before transport/auth debugging.
5. Maintain separate SAFE vs FULL server profiles.

### Pipeline requirement
Add a connector-safe validator before deploy. It must fail on:

- state-changing annotations in connector profile
- open schemas (`z.any`, `z.record(z.any())`)
- use of `child_process`, `exec`, `execFile`, dynamic dispatch
- tool names or handlers that imply patch/write/delete/rollback unless explicitly excluded from connector profile

### Process correction
Before claiming missing tool access, the assistant must call `api_tool.list_resources` and inspect the currently exposed tool surface. Tool availability must be treated as runtime state, not remembered context.


---

## 2026-05-02 — CRITICAL: Rollback failure for newly created files

### ISSUE
Rollback process failed with exception:
"Backup file missing: ..."

### ROOT CAUSE
- Deployment did not record files created during deploy
- Rollback assumed every file has a backup
- No fallback for newly created files

### IMPACT
- Rollback failure → inconsistent state
- Application startup failure possible

### FIX
- Implement rollback_v3:
  - detect newly created files
  - delete instead of restore if no backup exists
  - validate file existence before restore
- Add tests:
  - restore existing files
  - remove newly created files

### RULE-ROLLBACK-001
Rollback must support BOTH:
- restore (existing files)
- delete (new files)

---

## 2026-05-02 — SECURITY: Sensitive token leak in perf logs

### ISSUE
`.mcp_perf.log` contained:
- full request URLs with `?token=`
- Authorization headers

### ROOT CAUSE
- raw request data logged without sanitization

### IMPACT
- credential exposure
- logs unsafe to share

### FIX
- implement `redactSecret()`:
  - mask `?token=`
  - mask `Authorization: Bearer`

### RULE-LOG-001
Never log secrets. Always sanitize:
- query params
- headers

---

## 2026-05-02 — BUG: Test fragility (schema indirection)

### ISSUE
Tests failed due to expecting inline schema:
`z.string().min().max().regex()`

Implementation used shared constant.

### ROOT CAUSE
- tests rely on source pattern matching (regex)
- not semantic validation

### IMPACT
- false-negative test failure
- blocked deploy

### FIX
- inline schema in tool definition

### RULE-TEST-001
Avoid brittle tests based on source matching.
Prefer behavior-based validation.

---

## 2026-05-02 — SYSTEM: Registry rollout (v1–v4 safe model)

### SUMMARY
Implemented staged registry system with strict safety guarantees.

### PHASES
- v1: status/list (read-only)
- v2: get_tool (metadata lookup)
- v3: validate_tool (explicit decision model)
- v4: policy exposure (runtime/sandbox/limits/observability)

### GUARANTEES
- no dispatch
- no mutation
- no DSL execution
- connector-safe

### RULE-REGISTRY-001
Registry exposure must be read-only until full policy + validation layer is complete.


---

## 2026-05-03 — SYSTEM: Registry v5 preflight

### SUMMARY
Added `tool_registry_preflight` as policy decision layer before any planning or execution.

### INPUT
- `tool`
- `operation`

### VALIDATED CASES
- `code_analysis` + `read` -> allowed
- `code_analysis` + `mcp_apply` -> blocked (`operation_not_allowed`)
- missing tool -> blocked (`tool_not_found`)

### SAFETY GUARANTEES
- no dispatch
- no execution
- no mutation
- policy-only decision

### RULE-REGISTRY-002
No execution may be introduced until preflight and plan-only layers are both validated.
