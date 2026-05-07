# Current State

Data: 2026-05-07
Status: canonical_current
Zakres: aktualny stan projektu `C:\Work\mcp` po rolloutach registry execute v7.1, bounded web tools (`pypi_info`, `check_npm_package`, `fetch_github_file`), domknięciu test coverage dla web tools, korekcie testów registry execute v1.1 na aktywny runtime, wdrożeniu `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard`, `change_workflow_simulator`, `tool_usage_snapshot`, procesu multi-root z aliasami `@alias/...`, domknięciu regresji CI portability oraz integracji bounded process runner (`run_process`, `process_runner_status`)

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
- read-only profile i tools profile używają wspólnego modelu workspace rootów: bare paths wskazują primary root `C:\Work`, a dodatkowe rooty mogą być dołączane przez `MCP_EXTRA_ROOTS` i adresowane jako `@alias/...`
- w środowiskach nie-Windows domyślne rooty są wyprowadzane z checkoutu repo lub jawnych override `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`, żeby CI i testy nie traktowały `C:\Work` jako ścieżki względnej

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
- process tools

Potwierdzone aktywne narzędzia warstwy truth tools:

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`
- `change_workflow_simulator`
- `tool_usage_snapshot`

Potwierdzone aktywne narzędzia warstwy process tools:

- `run_process`
- `process_runner_status`

Model bezpieczeństwa tej warstwy:

- allowlisted bare executables
- `shell: false`
- bounded `cwd` przez workspace policy
- bounded stdout/stderr
- timeout
- audyt `process_start` / `process_finish`
- brak dziedziczenia pełnego `process.env` do child process
- PowerShell domyślnie tylko przez `-File` do workspace-local `.ps1`

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
- `change_workflow_simulator`
- `tool_usage_snapshot`

Rola:

- porównanie `runtime truth`, `docs truth`, `test truth` i `deploy truth`
- wykrywanie driftu między aktywnym runtime, canonical docs i kluczowymi testami
- mapowanie entrypointów, aktywnych modułów runtime, protected boundaries, legacy/staging areas i relacji test->runtime
- klasyfikacja zmiany jako `repo_only`, `test_only`, `runtime` albo `runtime_with_client_refresh`
- zwracanie minimalnego bezpiecznego workflow wdrożeniowego i powodów decyzji
- symulowanie operator workflow dla planowanej zmiany bez wykonywania deployu
- podsumowanie rzeczywistego użycia tooli na podstawie lokalnego `\.mcp_perf.log`, żeby decyzje o kolejnych narzędziach opierać o obserwowane wzorce użycia
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
- `pypi_info`
- `check_pypi_package`
- `check_npm_package`
- `fetch_github_file`

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
  - `pypi_info`
  - `check_pypi_package`
  - `check_npm_package`
  - `fetch_github_file`

Znana uwaga operacyjna:

- connector/safety layer może dawać false positives dla części wywołań mimo poprawnego MCP runtime
- `pypi_info` został dodany jako bardziej neutralny alias dla `check_pypi_package`, żeby zmniejszyć ryzyko heurystycznych blokad bez zrywania kompatybilności wstecznej
- live MCP verification z 2026-05-05 potwierdziła, że `pypi_info`, `check_pypi_package` i `http_get` poprawnie zwracają dane dla `https://pypi.org/pypi/zod/json`; to wzmacnia wniosek, że historyczne blokady były connector-dependent, a nie runtime-dependent
- `check_npm_package` został wdrożony jako bounded lookup po endpointcie `https://registry.npmjs.org/<package>/latest`, a nie po pełnym dokumencie pakietu; live MCP verification z 2026-05-05 potwierdziła `status: ok` dla `is-number` i `zod`
- `fetch_github_file` jest zawężony do `raw.githubusercontent.com` i przyjmuje jawne segmenty `owner/repo/ref/path`; nie pobiera HTML z `github.com`, nie używa auth i nie zapisuje nic na dysk

## 6. Recovery i legacy separation

Potwierdzone:

- startup recovery nie importuje już rollbacku z legacy `core/code_tools.js`
- `server_tools.js` używa:
  - `core/recovery_rollback.js`

Wniosek:

- poprzednia luka „safe runtime zależy startowo od legacy full profile” została zamknięta na poziomie kodu runtime i testów

## 6.5. Workspace scope

Potwierdzone lokalnie w kodzie i repo validation:

- filesystem, index i science path policy są liczone względem primary root `C:\Work`, a dodatkowe rooty są jawnie adresowane przez `@alias/...`
- runtime repo, docs canonical, logi, deploy control-plane i truth tools pozostają zakotwiczone w `C:\Work\mcp` niezależnie od liczby workspace rootów
- ochrona runtime pozostaje aktywna dla `mcp/core`, `mcp/server.js`, `mcp/server_tools.js`, `mcp/package.json` i `mcp/package-lock.json`

Potwierdzone live przez aktywny MCP po restarcie `server_tools.js` dnia 2026-05-06:

- `list_directory(".")` pokazuje primary root `C:\Work`, a nie dawny root `C:\Work\mcp`
- `list_directory("romionsim")` działa poprawnie i zwraca zawartość `C:\Work\romionsim`
- `get_info("mcp")` nadal wskazuje katalog runtime repo jako podkatalog primary workspace

## 6.6. Zamknięte regresje CI (2026-05-06)

Potwierdzone i zamknięte:

- regresja 1: `truth_tools.js` budował ścieżki runtime przez ręczne `\\`, co na runnerze Ubuntu łamało `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard`, `change_workflow_simulator` i `tool_usage_snapshot`
- naprawa 1: przejście na `path.join(...)` i test regresyjny pilnujący platform-safe path joins
- regresja 2: model multi-root zakładał Windowsowe domyślne rooty nawet na non-Windows hostach, więc CI traktowało `C:\Work` jako ścieżkę względną wewnątrz checkoutu
- naprawa 2: host-aware fallback w `core/config.js`; na Windows pozostają `C:\Work` / `C:\Work\mcp`, a na non-Windows rooty są wyprowadzane z checkoutu repo albo z `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`
- regresja 3: `tool_usage_snapshot` wymagał obecności lokalnego `.mcp_perf.log`, co nie jest gwarantowane na GitHub Actions
- naprawa 3: brak `.mcp_perf.log` nie wywraca już narzędzia; zwracany jest pusty snapshot `status: ok` z jawną notą o braku logu

Wniosek operacyjny:

- nowe narzędzia read-only nie mogą zakładać Windows-only path semantics
- testy config/path policy nie mogą hardcode'ować Windowsowych absolutnych ścieżek jako jedynego poprawnego środowiska wykonania
- narzędzia obserwacyjne i pomocnicze nie mogą wymagać lokalnych artefaktów runtime jako warunku przejścia całego CI
- po każdej większej zmianie path modelu albo truth tools trzeba sprawdzić nie tylko `npm test` lokalnie, ale też czy testy nie ukrywają założeń host-specific

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
- repo validation po wdrożeniu `change_workflow_simulator`:
  - `npm test` — PASS `82/82`
- repo validation po wdrożeniu bounded `check_npm_package`:
  - `npm test` — PASS `83/83`
- repo validation po wdrożeniu `fetch_github_file`:
  - `npm test` — PASS `84/84`
- repo validation po wdrożeniu `tool_usage_snapshot`:
  - `npm test` — PASS `86/86`
- repo validation po integracji bounded process runner:
  - `npm test` — PASS `101/101`
- live MCP verification po restarcie `server_tools.js`:
  - `project_truth_audit` — `status: ok`
  - `drifts: []`
  - `code_runtime_map` — `status: ok`
  - aktywne grupy runtime obejmują `truth tools`
  - `deploy_decision_guard` — `status: ok`
  - poprawna klasyfikacja scenariuszy `repo_only` i `runtime_with_client_refresh`
  - `change_workflow_simulator` — `status: ok`
  - poprawna symulacja scenariuszy `repo_only` i `runtime_with_client_refresh`
  - `check_npm_package("is-number")` — `status: ok`
  - `check_npm_package("zod")` — `status: ok`
  - `fetch_github_file("colinhacks/zod", "main", "package.json")` — `status: ok`
  - `tool_usage_snapshot()` — `status: ok`
  - snapshot potwierdził, że bieżące web/research usage pozostaje bounded i nie daje jeszcze dowodu potrzeby `download_docs`
- live MCP verification po restarcie `server_tools.js` i restarcie Codexa na `2026-05-07` potwierdziła obecność `run_process` i `process_runner_status` w aktywnym tool surface oraz `status: ok` dla `run_process(command=node, args=[--version], cwd=mcp)`; `process_runner_status` potwierdził też politykę `inherits_full_parent_env: false`

Obszary objęte testami:

- runtime paths
- policy/path guards
- import integrity
- deploy script
- rollback script
- perf script
- recovery no-legacy import
- MCP descriptor contract dla pełnego aktywnego surface `server_tools.js`, w tym web tools
- MCP descriptor contract dla pełnego aktywnego surface `server_tools.js`, w tym truth tools`r`n- multi-root config parsing i alias-based path policy
- MCP result-shape helpers
- registry safe layer
- registry execute simulation
- registry execute v1.1 assertions czytające aktywny runtime `core/registry_tools_safe.js`, nie staging artifact
- registry outputSchema runtime guards, w tym `tool_registry_execute`
- truth tools contract i handler baseline dla `project_truth_audit`
- truth tools contract i handler baseline dla `code_runtime_map`
- truth tools contract i handler baseline dla `deploy_decision_guard`
- truth tools contract i handler baseline dla `change_workflow_simulator`
- truth tools contract i handler baseline dla `tool_usage_snapshot`
- process tools contract i handler baseline dla `run_process` i `process_runner_status`
- web tools static/runtime-shape guards
- bounded npm package metadata guard
- bounded GitHub raw file guard

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


