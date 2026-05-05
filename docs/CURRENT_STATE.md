# Current State

Data: 2026-05-05
Status: canonical_current
Zakres: aktualny stan projektu `C:\Work\mcp` po rolloutach registry execute v7.1, web tools v1c, domknięciu test coverage dla web tools, korekcie testów registry execute v1.1 na aktywny runtime oraz wdrożeniu `project_truth_audit`, `code_runtime_map` i `deploy_decision_guard`

## 1. Stan repo i lokalnego runtime

Projekt jest lokalnym MCP runtime z kontrolowanym deploy/rollback.

Potwierdzone:

- repo lokalne: `C:\Work\mcp`
- branch: `main`
- upstream: `origin/main`
- runtime jest rozwijany lokalnie, a GitHub jest pomocniczym źródłem historii, nie zamiennikiem local truth

Najważniejsza zasada:

- source-of-truth dla bieżącego stanu technicznego pozostaje lokalny worktree i aktywny runtime path

## 2. Aktywny runtime

### `server.js`

Potwierdzone:

- read-only MCP
- port `3000`
- zakres ograniczony do `C:\Work\mcp`

### `server_tools.js`

Potwierdzone:

- tools profile
- port `3001`
- auth przez `MCP_TOKEN`
- `StreamableHTTPServerTransport`
- startup recovery
- runtime timing/perf hooks

Rejestrowane aktywne grupy tooli:

- index tools
- filesystem tools
- science tools
- connector-safe code tools
- connector-safe registry tools
- web tools
- truth tools

Potwierdzone aktywne narzędzie tej warstwy:

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`

## 3. Auth i tunel

### Potwierdzone

- `MCP_TOKEN` jest czytany z environment
- auth akceptuje:
  - query string `?token=...`
  - bearer header
- użytkownik operacyjnie używa:
  - `cloudflared tunnel --url http://127.0.0.1:3001`
- ChatGPT Desktop używa publicznego URL do `/mcp?token=...`

### Nadal niepotwierdzone bezpośrednio z kodu

- wewnętrzne zachowanie cache tool list po stronie klienta
- pełna logika connector-layer filtering poza MCP runtime

## 4. Registry control-plane

### Potwierdzone aktywne registry tools

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_execute`
- `tool_registry_plan`

### Potwierdzone aktywne truth tools

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`

Rola:

- porównanie `runtime truth`, `docs truth`, `test truth` i `deploy truth`
- wykrywanie driftu między aktywnym runtime, canonical docs i kluczowymi testami
- mapowanie entrypointów, aktywnych modułów runtime, protected boundaries, legacy/staging areas i relacji test->runtime
- klasyfikacja zmiany jako `repo_only`, `test_only`, `runtime` albo `runtime_with_client_refresh`
- zwracanie minimalnego bezpiecznego workflow wdrożeniowego i powodów decyzji
- narzędzie read-only, local-world, bez dispatch i bez side effects poza audytem

### Faktyczny model registry dziś

Registry jest:

- connector-safe
- no-dispatch
- no real execution
- simulation-only dla `tool_registry_execute`
- plan-driven

To oznacza:

- `tool_registry_execute` istnieje i jest wdrożone,
- ale real execution nadal nie jest wdrożone,
- dispatch nadal nie jest wdrożony,
- side effects przez registry execution nadal nie są dozwolone.

Live MCP verification z 2026-05-05 potwierdziła cały exposed registry control-plane:

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_plan`
- `tool_registry_execute`

### Czego nadal nie wolno nazywać aktywnym execution layer

- `dispatchRegisteredTool(...)` jako aktywny runtime connector path
- write-capable registry execution
- registry mutation
- network-capable registry execution przez registry path

## 5. Web tools

Potwierdzone aktywne toole:

- `http_get`
- `check_pypi_package`

Model bezpieczeństwa:

- read-only
- allowlisted
- bounded
- no auth
- no cookies
- no disk writes
- `openWorldHint: true`

Test coverage:

- `tests/mcp_contract_surface.test.js` obejmuje web tools przez `registerWebTools`
- test kontraktu wymusza obecność aktywnych web tools:
  - `http_get`
  - `check_pypi_package`

Znana uwaga operacyjna:

- connector/safety layer może dawać false positives dla części wywołań mimo poprawnego MCP runtime

## 6. Recovery i legacy separation

Potwierdzone:

- startup recovery nie importuje już rollbacku z legacy `core/code_tools.js`
- `server_tools.js` używa:
  - `core/recovery_rollback.js`

Wniosek:

- poprzednia luka „safe runtime zależy startowo od legacy full profile” została zamknięta na poziomie kodu runtime i testów

## 7. Deploy / rollback / perf

Potwierdzone:

- `deploy.ps1`
- `rollback.ps1`
- `perf.ps1`
- lokalna historia deployów w `.mcp_deploy`
- backupi deployów w `.mcp_deploy_backup`

Obowiązujący model dla zmian runtime MCP:

- staging w `.mcp_warzone`
- manifest w `.mcp_deploy`
- `Prepare`
- `Execute`
- restart serwera
- reconnect klienta, jeśli zmienił się tool surface / schemy / descriptor metadata
- runtime verification
- rollback w razie potrzeby

Zmiany testów i dokumentacji repo nie są automatycznie zmianami runtime MCP i nie wymagają domyślnie deploy pipeline, restartu ani reconnectu.

## 8. Testy

Aktualny checkpoint potwierdzony lokalnie po korektach test surface:

- staging validation `mcp_contract_surface_web_tools_v1`:
  - `node --check .mcp_warzone\mcp_contract_surface_web_tools_v1.test.js` — PASS
  - `node --test .mcp_warzone\mcp_contract_surface_web_tools_v1.test.js` — PASS `4/4`
- deploy validation testu `mcp_contract_surface_web_tools_v1`:
  - `deploy.ps1 -Mode Prepare` — PASS
  - `deploy.ps1 -Mode Execute` — PASS
  - post-deploy `npm test` — PASS `68/68`
- staging validation `registry_execute_v1_1_runtime_surface`:
  - `node --check .mcp_warzone\registry_execute_v1_1_runtime_surface.test.js` — PASS
  - `node --test .mcp_warzone\registry_execute_v1_1_runtime_surface.test.js` — PASS `7/7`
- repo validation po aktualizacji `tests/registry_execute_v1_1.test.js`:
  - `npm test` — PASS `69/69`
- repo validation po wdrożeniu `project_truth_audit`:
  - `npm test` — PASS `74/74`
- repo validation po wdrożeniu `code_runtime_map`:
  - `npm test` — PASS `76/76`
- repo validation po wdrożeniu `deploy_decision_guard`:
  - `npm test` — PASS `79/79`
- live MCP verification po restarcie `server_tools.js`:
  - `project_truth_audit` — `status: ok`
  - `drifts: []`
  - `code_runtime_map` — `status: ok`
  - aktywne grupy runtime obejmują `truth tools`
  - `deploy_decision_guard` — `status: ok`
  - poprawna klasyfikacja scenariuszy `repo_only` i `runtime_with_client_refresh`

Obszary objęte testami:

- runtime paths
- policy/path guards
- import integrity
- deploy script
- rollback script
- perf script
- recovery no-legacy import
- MCP descriptor contract dla pełnego aktywnego surface `server_tools.js`, w tym web tools
- MCP descriptor contract dla pełnego aktywnego surface `server_tools.js`, w tym truth tools
- MCP result-shape helpers
- registry safe layer
- registry execute simulation
- registry execute v1.1 assertions czytające aktywny runtime `core/registry_tools_safe.js`, nie staging artifact
- registry outputSchema runtime guards, w tym `tool_registry_execute`
- truth tools contract i handler baseline dla `project_truth_audit`
- truth tools contract i handler baseline dla `code_runtime_map`
- truth tools contract i handler baseline dla `deploy_decision_guard`
- web tools static/runtime-shape guards

### Ważne ograniczenie

Nie wszystkie testy są równie mocne, jak sugerują nazwy.

Potwierdzone luki:

- brak potwierdzonych aktywnych luk w zakresie dwóch zamkniętych punktów: web tools coverage i registry execute v1.1 source path

Zamknięte luki:

- `tests/mcp_contract_surface.test.js` obejmuje teraz web tools wystawiane przez runtime
- `tests/registry_execute_v1_1.test.js` czyta aktywny runtime file `core/registry_tools_safe.js` i sam test nie zależy już od pliku w `.mcp_warzone`

## 9. Wymagania środowiskowe Python

Potwierdzone:

- `core/science_tools.js` uruchamia helpery Python przez `python`
- helpery Python żyją w `core/`
- wymagania operacyjne są opisane w:
  - `docs/PYTHON_RUNTIME_REQUIREMENTS.md`

## 10. Najważniejsze otwarte nieprawidłowości

1. Część dokumentacji reference nadal wymaga ostrożnego porównywania z aktywnym runtime przed użyciem jako source-of-truth.
2. `MCP_TOOL_CONTRACTS.md` opisuje w części stary workflow i nie może być traktowany jako aktualna instrukcja operacyjna bez porównania z nowszymi docs.
3. Starsze docs registry/design nadal mieszają plan, historię i wdrożenie; `REGISTRY.md` oraz `RUNTIME_CONTRACTS_CURRENT.md` pozostają ważniejszymi źródłami dla bieżącego runtime.

## 11. Czytaj dalej

Jeśli potrzebujesz:

- głównych findings i zaleceń: `AUDIT_2026-05-03_DEEP.md`
- zgodności z OpenAI MCP / Apps: `OPENAI_MCP_CONFORMANCE_2026-05-03.md`
- aktualnego stanu registry: `REGISTRY.md`
- aktualnych kontraktów runtime: `RUNTIME_CONTRACTS_CURRENT.md`
- idiotoodpornego protokołu dla kolejnego LLM: `LLM_IDIOT_PROOF_PROTOCOL_2026-05-04.md`
