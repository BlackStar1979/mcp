# Dokumentacja `C:\Work\mcp`

Data porządkowania: 2026-05-03
Status: canonical index dla `docs/`

## Cel

Ten katalog był prowadzony niespójnie: obok siebie leżały dokumenty bieżące, notatki robocze, research, staging memory, roadmapy, log kroków i opisy historyczne. Ten plik ustawia porządek bez utraty informacji.

Kluczowa zasada:

- żaden pojedynczy starszy plik nie jest już samodzielnym źródłem prawdy,
- źródłem prawdy jest **zestaw dokumentów canonical** z tej sekcji.

## Czytaj w tej kolejności

1. `docs/README.md`
2. `docs/CURRENT_STATE.md`
3. `docs/AUDIT_2026-05-03_DEEP.md`
4. `docs/OPENAI_MCP_CONFORMANCE_2026-05-03.md`
5. `docs/LLM_EXECUTION_BRIEF.md`
6. `docs/AUDIT_2026-05-03.md`
7. `docs/DOCS_CATALOG.md`
8. `docs/MCP_OPERATOR_MANUAL.md`
9. `docs/PYTHON_RUNTIME_REQUIREMENTS.md` — jeśli pracujesz z `science_tools`

## Warstwy dokumentacji

### 1. Canonical / current

To są dokumenty, które należy czytać najpierw, jeśli celem jest zrozumienie aktualnego stanu projektu:

- `CURRENT_STATE.md`
- `AUDIT_2026-05-03_DEEP.md`
- `OPENAI_MCP_CONFORMANCE_2026-05-03.md`
- `LLM_EXECUTION_BRIEF.md`
- `AUDIT_2026-05-03.md`
- `DOCS_CATALOG.md`
- `MCP_OPERATOR_MANUAL.md`
- `ARCHITECTURE_DECISIONS.md`

### 2. Current reference, ale węższe tematycznie

To są dokumenty ważne, ale nie wystarczające jako samodzielny opis całego systemu:

- `PYTHON_RUNTIME_REQUIREMENTS.md`
- `REGISTRY_RUNTIME_DESIGN.md`
- `MCP_TOOL_CONTRACTS.md`
- `MCP_INTEGRATION_ISSUES.md`
- `status/mcp_tools_status.md`

### 3. Historical / timeline / legacy

To są dokumenty ważne historycznie, ale nie wolno ich czytać jako czystego opisu aktualnego runtime bez porównania z kodem:

- `MCP_STEP_LOG.md`
- `MCP_OPENAI_ROADMAP.md`
- `MCP_OPENAI_NEXT_START.md`
- `mcp_apps_sdk_audit.md`
- `openai_apps_mcp_extract.md`
- `openai_apps_mcp_research_v2.md`
- wszystko w `docs/archive/`

## Reguły świeżości

Każdy dokument należy interpretować według jednej z etykiet:

- `canonical_current`
- `current_reference`
- `historical_reference`
- `staging_or_local_only`
- `contradicted_by_code`

Pełna klasyfikacja plików jest w:

- `docs/DOCS_CATALOG.md`

## Reguły aktualizacji dokumentacji od dziś

1. Nowy stan bieżący opisujemy najpierw w `CURRENT_STATE.md`.
2. Nowy audyt dostaje osobny plik datowany, np. `AUDIT_YYYY-MM-DD.md`.
3. `MCP_STEP_LOG.md` pozostaje dziennikiem czasu, nie dokumentem source-of-truth.
4. Dokumenty projektowe i implementacyjne muszą mieć jawne pola:
   - `Data`
   - `Status`
   - `Zakres`
   - `Czy opisuje runtime aktywny czy plan/history`
5. Dokument, który przestaje być source-of-truth, nie jest usuwany; jego status musi zostać obniżony w `DOCS_CATALOG.md`.
6. `.mcp_warzone/`, `.mcp_deploy/`, `.mcp_deploy_backup/`, `.mcp_audit*`, `.mcp_perf*` nie są dokumentacją canonical; mogą być tylko źródłem dowodowym dla audytu.

## Czego nie robić

- nie czytać `MCP_INDEX.md` jako jedynego źródła prawdy,
- nie czytać `MCP_OPENAI_ROADMAP.md` jako gwarancji, że wszystko opisane tam jest aktywne,
- nie traktować samego istnienia pliku w repo jako dowodu wdrożenia,
- nie traktować stagingu z `.mcp_warzone/` jako warstwy do automatycznego przenoszenia do repo.

## Wniosek operacyjny

Od tej chwili porządek dokumentacji jest następujący:

- `README.md` mówi jak czytać `docs/`,
- `CURRENT_STATE.md` opisuje aktualny stan,
- `AUDIT_2026-05-03_DEEP.md` jest głównym dokumentem findings i ryzyk,
- `OPENAI_MCP_CONFORMANCE_2026-05-03.md` opisuje zgodność MCP / Apps,
- `DOCS_CATALOG.md` klasyfikuje całą resztę po świeżości, czasie i autorytecie,
- `PYTHON_RUNTIME_REQUIREMENTS.md` opisuje jawnie wymagania Python dla `science_tools`.
