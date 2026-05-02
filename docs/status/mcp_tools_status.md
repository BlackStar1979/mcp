# MCP Tools Status

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
