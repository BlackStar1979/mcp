# Audyt rozszerzony projektu `C:\Work\mcp`

Data: 2026-05-03
Status: historical_reference
Zakres: kod runtime, kontrakty MCP, skrypty operatorskie, zależności, testy, dokumentacja `docs/`, lokalne artefakty operatorskie

## 1. Cel

Ten dokument rozszerza `AUDIT_2026-05-03.md`. Jego celem nie jest powtórzenie podstawowego obrazu repo, tylko głębsze prześwietlenie:

- nieprawidłowości,
- ryzyk regresji,
- ukrytych zależności,
- zgodności z zasadami MCP / OpenAI Apps,
- jakości prowadzenia dokumentacji.

## 2. Co zostało sprawdzone

### Kod i runtime

- `server.js`
- `server_tools.js`
- `core/auth.js`
- `core/responses.js`
- `core/tools_fs.js`
- `core/tools_index.js`
- `core/science_tools.js`
- `core/code_tools_safe.js`
- `core/registry_tools_safe.js`
- `core/recovery_rollback.js`
- `core/code_tools.js` jako legacy/write-capable residue
- `core/config.js`

### Skrypty i control-plane

- `deploy.ps1`
- `rollback.ps1`
- `perf.ps1`
- lokalne recordy w `.mcp_deploy/`
- backupi w `.mcp_deploy_backup/`

### Testy

- cały lokalny zestaw `npm test`
- testy registry v1-v6
- testy deploy / rollback / perf
- test `tests/recovery_no_legacy_import.test.js`
- test `tests/mcp_contract_surface.test.js`
- test `tests/mcp_result_shape.test.js`

### Dokumentacja

- dokumenty canonical dodane 2026-05-03
- dokumenty current reference
- dokumenty historyczne i researchowe
- zgodność z:
  - `docs/openai_apps_mcp_extract.md`
  - `docs/openai_apps_mcp_research_v2.md`

## 3. Najważniejsze findings

### F1. Startup recovery został odłączony od legacy `core/code_tools.js`

Status: `resolved (2026-05-03)`

### F2. Wymagania Python dla science tools są jawnie udokumentowane

Status: `resolved-docs (2026-05-03)`

Potwierdzone:

- `docs/PYTHON_RUNTIME_REQUIREMENTS.md` opisuje wymagania środowiskowe,
- root `README.md` zawiera skrót wymagań Python,
- helpery Python są jednoznacznie zlokalizowane w `core/`.

Wniosek:

- luka dokumentacyjna została zamknięta,
- runtime nadal zależy od środowiska Python, ale zależność jest jawna i kontrolowalna.

Pozostałe możliwe utwardzenia:

- `requirements.txt` / lock,
- test środowiskowy Python.

### F3–F4 bez zmian względem poprzedniej wersji (kontrakty MCP i testy)

## 6. Werdykt końcowy

Projekt jest spójny operacyjnie:

- runtime
- testy
- dokumentacja

są zsynchronizowane.

Otwarte pozostają tylko kwestie optymalizacji i rozszerzeń, nie błędy strukturalne.
