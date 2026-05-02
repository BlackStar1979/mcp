# MODULARIZATION PLAN

Data: 2026-04-25

## Decyzja
`server_tools.js` zostaje lekkim kontenerem/entrypointem. Logika idzie do osobnych modułów.

## Cel
Zmniejszyć `server_tools.js` z ~700+ linii do ok. 80-120 linii i ułatwić dalszy rozwój.

## Docelowa struktura w `C:\Work\mcp`

```text
mcp/
├── server_tools.js              # entrypoint Express + MCP transport
├── config.js                    # stałe, ścieżki, limity
├── auth.js                      # requireAuth
├── responses.js                 # ok/fail/textOk/registerSafeTool
├── paths.js                     # safePath/toRel/assertWritablePath
├── audit.js                     # audit log
├── fs_ops.js                    # backup, trash, fileInfo, JSON helpers
├── indexer.js                   # buildIndex/loadIndex/tokenize/scoring/context
├── tools_fs.js                  # list/read/write/append/copy/move/delete/restore
├── tools_index.js               # build_index/index_status/search_index/search_index_context/collect_context
├── package.json
└── node_modules/
```

## Kolejność wdrożenia

1. Przygotować pełen komplet plików w stagingu poza `mcp`, np. `C:\Work\_mcp_next`.
2. Użytkownik kopiuje zawartość `_mcp_next` do `C:\Work\mcp`.
3. Restart `node C:\Work\mcp\server_tools.js`.
4. Test `index_status`.
5. Dopiero potem ewentualnie dalsze funkcje.

## Zasady

- Nie patchować fragmentami.
- Każdy moduł jako pełny plik.
- Nie zmieniać nazw narzędzi MCP.
- Nie trzeba stawiać aplikacji od nowa, jeśli nazwy i inputSchema pozostają bez zmian.
- Jeśli zmieni się lista narzędzi lub inputSchema, wtedy usunąć i dodać app ponownie.

## Priorytet
Najpierw modularizacja bez zmian funkcjonalnych. Potem dopiero nowe funkcje.
