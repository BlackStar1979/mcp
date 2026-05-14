# MCP Tools Status

Data: 2026-05-04
Status: contradicted_in_part
Zakres: historyczny snapshot runtime z 2026-05-01; nie opisuje już bieżącego tool surface ani zamkniętych później zabezpieczeń

## Ważne

Ten dokument zachowuje wartość jako krótki zapis wcześniejszego etapu projektu, ale nie może być czytany jako aktualny opis runtime.

Czytaj zamiast niego:

1. `docs/CURRENT_STATE.md`
2. `docs/RUNTIME_CONTRACTS_CURRENT.md`
3. `docs/reference/REGISTRY.md`
4. `docs/DOCS_CATALOG.md`

Stan na: 2026-05-01

## Działające elementy

- Serwer tools MCP działa na `server_tools.js`.
- Endpoint: `/mcp`.
- Katalog bazowy: `C:\\Work\\mcp`.
- Dostęp jest ograniczony przez `MCP_TOKEN`.
- Potwierdzone operacje:
  - `list_directory`
  - `read_file`
  - `write_file`
  - `delete_path` dostępne, ale nieprzetestowane po zabezpieczeniu
  - `move_path` dostępne, ale nieprzetestowane po zabezpieczeniu

## Ważne ustalenia

- Aplikacja knowledge/data-only obsługuje tylko `search` i `fetch`.
- Osobna aplikacja tools obsługuje operacje plikowe.
- Token musi być URL-safe, najlepiej tylko `A-Z`, `a-z`, `0-9`.
- Cloudflare quick tunnel jest tymczasowy; po restarcie tunelu zwykle zmienia się URL.

## Następny priorytet

Wdrożyć bezpieczniejszą wersję `server_tools.js`:

1. logowanie operacji do pliku,
2. kosz zamiast trwałego usuwania,
3. automatyczne backupy przed nadpisaniem,
4. limit rozmiaru plików,
5. blokada operacji na `node_modules` i plikach konfiguracyjnych MCP bez jawnego obejścia.
