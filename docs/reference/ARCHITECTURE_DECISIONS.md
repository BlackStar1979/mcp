# Architecture decisions

Data: 2026-05-01
Status: current_reference
Zakres: bazowe decyzje architektoniczne repo i runtime; czytać jako skrót zasad, nie jako pełny bieżący snapshot wdrożenia

## Ważne

Ten dokument pozostaje użyteczny jako krótka baza decyzji repo/runtime, ale nie jest nadrzędnym source-of-truth dla aktywnego stanu wdrożenia.

Czytaj razem z:

1. `docs/CURRENT_STATE.md`
2. `docs/RUNTIME_CONTRACTS_CURRENT.md`
3. `docs/DOCS_CATALOG.md`

## Scope

Projekt ma dwa uruchamialne serwery MCP:

- `server.js` — podstawowy read-only MCP dla plików w `C:\Work\mcp`.
- `server_tools.js` — modularny MCP z narzędziami FS, polityką bezpieczeństwa i lokalnym dostępem do plików.

## Repository layout

Do repozytorium GitHub wchodzą:

- kod źródłowy,
- testy,
- konfiguracja npm,
- konfiguracja CI,
- `docs/` jako dokumentacja projektowa.

Nie wchodzą runtime artefakty, indeksy, logi, backupy ani sandboxy robocze.

## Runtime and local-only directories

Te ścieżki są lokalne i nie powinny być publikowane:

- `.mcp_audit/` — lokalne ledgery i artefakty observability runtime.
- `.mcp_audit.log` — aktywny lokalny audit log runtime.
- `.mcp_backups/` — automatyczne backupy tworzone przez narzędzia plikowe.
- `.mcp_index/` — lokalny indeks wyszukiwania.
- `.mcp_trash/` — lokalny kosz operacji usuwania.
- `.mcp_warzone/` — sandbox na eksperymenty, wersje próbne i pliki tymczasowe.
- `.mcp_deploy/` — manifesty i recordy lokalnego workflow deploy.
- `.mcp_deploy_backup/` — backupy tworzone przez workflow deploy.

## Audit decision

Audit i performance logging są aktywnymi elementami lokalnego runtime operatorskiego:

- istnieje aktywny `core/audit.js`,
- istnieje aktywny `core/perf.js`,
- aktywne runtime zapisują zdarzenia do `.mcp_audit.log` i `.mcp_perf.log`,
- observability coverage jest traktowane jako część correctness runtime.

Decyzja: artefakty audit/perf są lokalnymi źródłami dowodowymi dla operatorskiego runtime, ale nie są canonical documentation ani częścią publikowanego repo.

## Performance logging decision

Mechanizmy `.mcp_perf.log` i `.mcp_perf_on` są aktywne w lokalnym runtime operatorskim. Nowy runtime/tool path nie powinien być uznawany za gotowy, jeśli omija wymagane perf/audit coverage.

## Documentation decision

Dawny katalog `.mcp_notes` został przeniesiony do `docs/`, ponieważ zawiera dokumentację projektową i powinien być wersjonowany w GitHub.

## Current engineering baseline

Aktualny baseline repozytorium:

- publikować `docs/`,
- nie publikować `.mcp_audit`, `.mcp_warzone`, `.mcp_backups`, `.mcp_index`, `.mcp_trash`, `.mcp_deploy`, `.mcp_deploy_backup`, logów i cache,
- nie wprowadzać nowego runtime/tool path bez spójnego observability coverage i testów,
- utrzymać `server.js` jako read-only MCP,
- utrzymać `server_tools.js` jako modularny MCP narzędziowy.
