# MCP TODO (updated)

## Stan
System działa: MCP knowledge + MCP tools + index + context.

---

## Architektura

- MCP Knowledge → search/fetch
- MCP Tools → filesystem + index + context
- AI → analiza (po stronie modelu)

---

## Workflow docelowy

1. search_index
2. search_index_context
3. collect_context
4. read_file
5. analiza
6. write_file (reports)

---

## TODO — techniczne

- [ ] structuredContent dla wyników
- [ ] outputSchema dla tools
- [ ] rate limiting (IP)
- [ ] ewentualnie resource_link

---

## TODO — funkcjonalne

- [ ] katalog reports/
- [ ] workflow analyze_project
- [ ] workflow audit_project
- [ ] workflow make_report

---

## TODO — organizacyjne

- [ ] utrzymywać notatki w _notes/
- [ ] nie polegać na kontekście rozmowy
- [ ] dokumentować decyzje na bieżąco

---

## Decyzje

- NIE używamy teraz openaiFileResponse
- MCP = narzędzia + kontekst, NIE automatyczny agent
- analiza po stronie modelu

---

## Ostatni test

collect_context("raport") → OK


---

## Refactor v1 — FastMCP-inspired patterns

Status: zaplanowane / w przygotowaniu.

Zakres:
- [ ] helper `ok(data)`
- [ ] helper `fail(message, details)`
- [ ] wrapper `registerSafeTool(...)`
- [ ] `structuredContent` dla narzedzi indeksu
- [ ] `outputSchema` dla narzedzi indeksu
- [ ] jednolity format wynikow
- [ ] bledy narzedzi jako `isError: true`

Nie robimy:
- migracji do FastMCP
- przebudowy na wiele plikow JS w tej iteracji

Notatka szczegolowa: `_notes/REFACTOR_V1_NOTES.md`


---

## Modularizacja MCP — status 2026-04-25

Dokument szczegółowy:

```text
_notes/MODULARIZATION_STATUS.md
```

### Decyzja

`server_tools.js` zostaje lekkim kontenerem. Logika idzie do modułów.

### Struktura docelowa

```text
mcp/
├── server_tools.js
├── config.js
├── auth.js
├── responses.js
├── paths.js
├── audit.js
├── fs_ops.js
├── indexer.js
├── tools_fs.js
└── tools_index.js
```

### Wdrożone częściowo / staging

Pliki robocze znajdują się w:

```text
C:\Work\_mcp_next
```

### Do sprawdzenia przed finalizacją

- [ ] `tools_fs.js` ma mieć: list/get/read/write/append/copy/move/delete/restore
- [ ] `tools_index.js` ma mieć: index_status/build_index/search_index/search_index_context/collect_context
- [ ] po skopiowaniu do `C:\Work\mcp` wykonać restart node
- [ ] przetestować pełny zestaw tools

### Uwaga

Nie traktować wersji minimalnej modulara jako finalnej. Pierwszy etap miał tylko część narzędzi indeksu i część FS. Finalny staging musi mieć pełne parity ze starym monolitem.
