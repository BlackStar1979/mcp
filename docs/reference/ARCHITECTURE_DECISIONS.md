# Architecture decisions

Data: 2026-05-01

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

- `.mcp_audit/` — planowane miejsce na audyt zdarzeń runtime; obecnie brak aktywnej integracji produkcyjnej.
- `.mcp_audit.log` — historyczny plik logu; obecnie nie jest wiarygodnym źródłem aktywnego audytu.
- `.mcp_backups/` — automatyczne backupy tworzone przez narzędzia plikowe.
- `.mcp_index/` — lokalny indeks wyszukiwania.
- `.mcp_trash/` — lokalny kosz operacji usuwania.
- `.mcp_warzone/` — sandbox na eksperymenty, wersje próbne i pliki tymczasowe.

## Audit decision

Audyt jest wymaganiem docelowym, ale obecny stan jest niespójny:

- istnieją ślady `.mcp_audit.log`,
- istnieje katalog `.mcp_audit/`,
- archiwalne lub eksperymentalne implementacje są w sandboxie,
- brak potwierdzonej, aktywnej integracji runtime w produkcyjnych modułach.

Decyzja: nie traktować obecnego audytu jako funkcji produkcyjnej. Przywrócenie audytu wymaga osobnego zadania z testami, spójnym formatem zdarzeń i jasnym miejscem zapisu.

## Performance logging decision

Historyczne mechanizmy `.mcp_perf.log` i `.mcp_perf_on` są traktowane jako nieaktywne. Jeżeli monitoring wydajności wróci, powinien zostać zaimplementowany jako jawna funkcja runtime z testami i dokumentacją.

## Documentation decision

Dawny katalog `.mcp_notes` został przeniesiony do `docs/`, ponieważ zawiera dokumentację projektową i powinien być wersjonowany w GitHub.

## Current engineering baseline

Aktualny baseline repozytorium:

- publikować `docs/`,
- nie publikować `.mcp_audit`, `.mcp_warzone`, `.mcp_backups`, `.mcp_index`, `.mcp_trash`, logów i cache,
- nie wprowadzać częściowo działającego audytu/perf do runtime bez osobnej implementacji i testów,
- utrzymać `server.js` jako read-only MCP,
- utrzymać `server_tools.js` jako modularny MCP narzędziowy.
