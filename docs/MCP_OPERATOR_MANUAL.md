# MCP Operator Manual

Instrukcja operacyjna dla lokalnego MCP control plane.

Dokument nadrzędny dla reguł dokumentacyjnych:

- `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`

## 1. Komponenty

| Komponent | Plik / katalog | Funkcja |
|---|---|---|
| Audit log | `.mcp_audit.log` | append-only JSONL log zdarzeń operacyjnych |
| Deploy | `deploy.ps1` | kontrolowane wdrażanie zmian |
| Rollback | `rollback.ps1` | kontrolowane cofanie wdrożeń |
| Perf | `perf.ps1` | pomiar i raportowanie czasów MCP |
| Staging | `.mcp_warzone` | tymczasowe artefakty robocze |
| Deploy state | `.mcp_deploy` | manifesty i rekordy deployów |
| Deploy backup | `.mcp_deploy_backup` | backup plików per deployment id |
| Tests | `tests/*.test.js` | regresja i kontrola integralności |

## 2. Zasady krytyczne

1. Nie kopiować plików ręcznie do runtime.
2. Zmiany runtime przechodzą przez `deploy.ps1`.
3. Manifest w `.mcp_deploy` jest wymagany dla zmian runtime, nie dla `repo-only` docs/testów.
4. Każdy deploy ma `Prepare`, `Execute`, backup, hash tracking i audit log.
5. Po deployu kodu trzeba zrestartować MCP, bo Node.js nie ładuje ponownie modułów automatycznie.
6. Po zmianach `repo-only` w testach i dokumentacji restart MCP nie jest wymagany; po zmianach runtime jest wymagany.
7. Reconnect klienta jest wymagany tylko wtedy, gdy zmienia się aktywny tool surface, descriptor metadata lub schema handshake widoczny dla klienta.
8. Tokeny i sekrety nie mogą trafiać do logów; po wycieku token należy rotować.
9. Dodatkowe workspace rooty dodaje się przez `MCP_EXTRA_ROOTS` i adresuje jawnie przez `@alias/...`; nie dokłada się ich przez kolejny redesign ścieżek.

## 2.1 Klasy zmian

| Klasa zmiany | Deploy | Restart MCP | Reconnect klienta |
|---|---:|---:|---:|
| `repo_only` | no | no | no |
| `test_only` | no | no | no |
| `runtime` | yes | yes | no |
| `runtime_with_client_refresh` | yes | yes | yes |

## 2.2 Workspace roots

Domyślny model:

- primary root: `C:\Work`
- runtime/control-plane: `C:\Work\mcp`
- dodatkowe rooty: przez `MCP_EXTRA_ROOTS`

Przykład:

```powershell
$env:MCP_EXTRA_ROOTS = "portfolio=C:\Portfolio;thesis=C:\Users\mczyz\Documents\Praca licencjacka"
node C:\Work\mcp\server_tools.js
```

Adresowanie:

- bare paths i `.` -> `C:\Work`
- `@portfolio/...` -> `C:\Portfolio\...`
- `@thesis/...` -> `C:\Users\mczyz\Documents\Praca licencjacka\...`


## 2.3 Publiczny Access host

Aktualny model dla publicznego modular MCP:

- host: `https://modular-mcp.romionologic.dev/mcp`
- edge auth: Cloudflare Access `SERVICE AUTH`
- klient MCP/Codex wysyła:
  - `CF-Access-Client-Id`
  - `CF-Access-Client-Secret`
- origin `server_tools.js` akceptuje request po obecności `Cf-Access-Jwt-Assertion`
- `MCP_TOKEN` pozostaje wyłącznie lokalnym fallbackiem dla direct localhost, nie docelowym publicznym modelem auth

## 2.4 Publiczny connector-safe host

Aktualny model dla publicznego connector-safe MCP:

- host: `https://mcp-stc-safe.romionologic.dev/mcp`
- runtime: `node C:\Work\mcp\stc_safe.js`
- brak auth
- exposed tools:
  - `search`
  - `fetch`
- shape version:
  - `2025-05-strict-v1`

Ważna reguła praktyczna:

- dla publicznych hostów MCP używanych przez ChatGPT Desktop nie używać underscore w hostname
- obserwacja potwierdzona praktycznie:
  - `mcp_stc_safe...` nie przechodził handshake w Desktop app
  - `mcp-stc-safe...` działa poprawnie
## 3. Standardowy cykl zmiany

### 3.1 Przygotowanie pliku

Plik roboczy umieścić w `.mcp_warzone`, np.:

```powershell
.mcp_warzone\core_perf_replacement.js
```

### 3.2 Manifest

Manifest zapisać w `.mcp_deploy`, np.:

```json
{
  "deployment_name": "example_v1",
  "purpose": "Short deployment purpose",
  "files": [
    {
      "source": ".mcp_warzone/example.js",
      "target": "core/example.js"
    }
  ]
}
```

### 3.3 Prepare

```powershell
cd C:\Work\mcp
.\deploy.ps1 -Mode Prepare -Manifest .mcp_deploy\example_v1.manifest.json
```

Efekt: powstaje `.mcp_deploy\<deployment_id>.prepare.json`.

### 3.4 Execute

```powershell
cd C:\Work\mcp
.\deploy.ps1 -Mode Execute -Manifest .mcp_deploy\example_v1.manifest.json
```

Pipeline wykonuje:

1. pre-check,
2. backup,
3. copy przez deploy script,
4. hash verification,
5. `.executed.json`,
6. post-check,
7. wpis do `.mcp_audit.log`.

### 3.5 Restart MCP

W oknie serwera:

```powershell
CTRL + C
node C:\Work\mcp\server_tools.js
```

Po restarcie poprawny log zawiera:

```text
MODULAR MCP running v1.7.0
URL: http://127.0.0.1:3001/mcp
RECOVERY: { status: 'recovery_ok', recovered_count: 0 }
```

### 3.6 Reconnect klienta

W ChatGPT Desktop:

1. rozłącz `Lokalne pliki tools`,
2. połącz ponownie,
3. sprawdź, czy narzędzia są dostępne po nowym zasobie konektora.

## 4. Rollback

### Dry-run rollback

```powershell
cd C:\Work\mcp
.\rollback.ps1 -DeploymentId <deployment_id> -WhatIfOnly
```

### Real rollback

```powershell
cd C:\Work\mcp
.\rollback.ps1 -DeploymentId <deployment_id>
```

Efekt: przywrócenie plików z `.mcp_deploy_backup\<deployment_id>` oraz zapis rekordu rollbacku.

## 5. Performance telemetry

### Włączenie

```powershell
cd C:\Work\mcp
.\perf.ps1 -Mode Enable
```

Tworzy `.mcp_perf_on`.

### Wyłączenie

```powershell
cd C:\Work\mcp
.\perf.ps1 -Mode Disable
```

### Status

```powershell
.\perf.ps1 -Mode Status
```

### Raport

```powershell
.\perf.ps1 -Mode Report
```

### Tail

```powershell
.\perf.ps1 -Mode Tail -Limit 20
```

## 6. Interpretacja perf report

Najważniejsze pola:

| Pole | Znaczenie |
|---|---|
| `sampled` | liczba przeanalizowanych wpisów |
| `tool_calls` | liczba wywołań narzędzi MCP |
| `requests` | liczba requestów HTTP MCP |
| `slow_count` | liczba wolnych operacji według `MCP_PERF_SLOW_MS` |
| `error_count` | liczba błędnych operacji |
| `top_slow` | najwolniejsze requesty/narzędzia |
| `by_tool` | agregacja per tool |

## 7. Audit log

Plik:

```powershell
C:\Work\mcp\.mcp_audit.log
```

Format: JSONL.

Nowe wpisy systemowe mają co najmniej:

```json
{
  "ts": "...",
  "level": "info",
  "source": "deploy.ps1",
  "event": "deploy_execute_ok",
  "action": "deploy_execute_ok",
  "pid": 1234
}
```

## 8. Scenariusze awaryjne

### MCP nie startuje po deployu

1. Znaleźć ostatni deployment id w `.mcp_deploy`.
2. Wykonać rollback:

```powershell
.\rollback.ps1 -DeploymentId <deployment_id>
```

3. Uruchomić MCP ponownie:

```powershell
node C:\Work\mcp\server_tools.js
```

### Deploy nie przechodzi

Sprawdzić wynik:

```powershell
npm test
node --check server_tools.js
```

Nie restartować MCP po nieudanym deployu.

### ChatGPT Desktop nie tworzy łącznika do MCP

Kolejność diagnostyczna:

1. sprawdzić `GET /healthz`
2. sprawdzić `POST /mcp initialize`
3. sprawdzić hostname:
   - preferować myślniki
   - unikać underscore
4. sprawdzić, czy testowany jest właściwy profil:
   - `stc_safe.js` dla Desktop connectora
   - nie `server_tools.js` z mutation-capable surface

Nie zakładać automatycznie, że brak handshake oznacza zły response shape serwera.

### ChatGPT Desktop — zasady użycia operacyjnego

Desktop traktować głównie jako kanał read-only.

Preferowane użycie:

- `search`
- `fetch`
- `code_sample_js`
- read-only file inspection
- bounded context extraction
- audit review
- refresh tools po zmianach descriptor/tool-surface

Nie używać przez Desktop do tego projektu:

- `write_file`
- `append_file`
- `edit_file_patch`
- `run_process`
- `copy_path`
- `move_path`
- `delete_path`
- dużych payloadów patchujących
- `node -e` repair commands
- regex one-liner repair commands

Reguła workflow:

- ChatGPT/Codex przygotowuje zmianę
- człowiek / lokalny edytor / lokalny Codex stosuje zmianę
- PowerShell / lokalny runtime weryfikuje
- Desktop wykonuje tylko read-only testy

Reguła bezpieczeństwa:

- nie stosować payload smuggling
- nie kodować/dekodować wrażliwych fraz po to, by obejść approval/preflight
- jeśli request nie dociera do MCP, problem nie jest server-side i nie zostawi śladu w audit logu serwera

### Perf log zawiera stary token

Stare wpisy pozostają historyczne. Po wdrożeniu redakcji i restarcie nowe wpisy powinny mieć:

```text
/mcp?token=[REDACTED]
```

Jeżeli token pojawił się jawnie, należy go rotować.

### Perf log rośnie za szybko

```powershell
Rename-Item .mcp_perf.log .mcp_perf.log.bak
```

albo po świadomej decyzji:

```powershell
Remove-Item .mcp_perf.log
```

## 9. Testy

Uruchomienie:

```powershell
cd C:\Work\mcp
npm test
```

Aktualnie testy obejmują:

- ścieżki runtime,
- policy/path guards,
- integralność importów,
- brak startup dependency od legacy `core/code_tools.js`,
- MCP descriptor contract,
- MCP result-shape helpers,
- deploy script,
- rollback script,
- perf script,
- registry safe layer.

Historyczny checkpoint po serii deployów 2026-05-03:

```text
tests 51
pass 51
fail 0
```

## 10. Aktualny zamknięty zakres

Zamknięty rozdział obejmuje:

- structured audit logger,
- deploy pipeline `Prepare` / `Execute`,
- rollback pipeline,
- pre/post deploy validation,
- perf telemetry,
- redakcję tokenów w perf logu,
- testy regresyjne,
- izolację startup recovery od legacy `core/code_tools.js`,
- bazowy MCP descriptor contract,
- bazowy MCP result-shape contract,
- dokumentację wymagań Python dla `science_tools`.

## 11. Checkpoint 2026-05-03 po restarcie MCP

Po deployu `python_docs_v1` i restarcie MCP potwierdzono:

- aplikacja wstała,
- konektor `Lokalne pliki tools` działa po ponownym połączeniu,
- zasób konektora zmienił identyfikator po restarcie, co jest oczekiwane,
- ostatni deploy record `2026-05-03T10-25-04-867Z_15dcc3ad.executed.json` ma status `executed`,
- `npm test` przechodzi `51/51`,
- aktywne docs obejmują `docs/reference/PYTHON_RUNTIME_REQUIREMENTS.md`.

## 12. Bieżący checkpoint 2026-05-04

Po późniejszych poprawkach test coverage i registry runtime contracts potwierdzono:

- `tests/mcp_contract_surface.test.js` obejmuje aktywne web tools `http_get` i `check_pypi_package`,
- `tests/registry_execute_v1_1.test.js` czyta aktywny runtime `core/registry_tools_safe.js`, nie staging JS z `.mcp_warzone`,
- `npm test` przechodzi `69/69`,
- repo-only zmiany w testach i dokumentacji nie wymagają deploy pipeline, restartu MCP ani reconnectu klienta.

## 13. Następny etap

Po zamknięciu bieżącego rozdziału kolejne prace powinny dotyczyć optymalizacji i rozszerzeń:

- rollout `outputSchema` poza bounded IO readers,
- odchudzenie `content` względem `structuredContent`,
- testy result-shape na realnych handlerach,
- opcjonalny `requirements.txt` albo test środowiska Python.



