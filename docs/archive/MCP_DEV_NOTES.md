# MCP DEV NOTES (persistent)

## Zasada
Nie polegać na kontekście rozmowy. Wszystkie decyzje i istotne fragmenty zapisywać.

---

## Aktualna architektura

### MCP Knowledge (3000)
- search / fetch → działa

### MCP Tools (3001)
- filesystem tools → OK
- soft delete (.mcp_trash) → OK
- backup (.mcp_backups) → OK
- audit log (.mcp_audit.log) → OK

### Index
- build_index → OK
- search_index → OK
- search_index_context → OK
- collect_context → OK

---

## Ograniczenia

- MCP nie obsługuje natywnie openaiFileResponse
- brak bezpośredniego uploadu plików z chat (jak GPT Actions)
- duże pliki i tokeny blokowane przy write

---

## Wzorzec agentowy

1. search_index / search_index_context
2. collect_context
3. read_file (wybrane)
4. analiza (LLM)
5. write_file → raport

---

## TODO (operacyjne)

- [ ] Dodać structuredContent do narzędzi indeksu
- [ ] Dodać outputSchema
- [ ] Dodać rate limiting (IP)
- [ ] Dodać katalog reports/
- [ ] Workflow: analyze_project
- [ ] Workflow: audit_project

---

## Uwagi techniczne

- Kod MCP znajduje się w C:\\Work\\mcp
- MCP tools nie mają prawa pisać do katalogu mcp
- Każda zmiana narzędzi = reinstall app

---

## Dokumentacja MCP (istotne fragmenty)

- tools/list
- tools/call
- structuredContent
- outputSchema
- isError

---

## Ostatni test

collect_context("raport") → OK
