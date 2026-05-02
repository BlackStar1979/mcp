# REFACTOR V1 NOTES

Data: 2026-04-25

## Cel
Zastosowac wzorce inspirowane FastMCP bez migracji technologicznej.

## Zakres refactor v1

1. Dodac helpery odpowiedzi:
   - `ok(data)`
   - `fail(message, details)`

2. Dodac wrapper narzedzi:
   - `registerSafeTool(server, name, config, handler)`
   - wrapper ma zwracac `structuredContent` + fallback `content[0].text`
   - bledy wykonania maja wracac jako `isError: true`, a nie jako niekontrolowany throw tam, gdzie to praktyczne.

3. Dodac `outputSchema` przynajmniej dla:
   - `index_status`
   - `search_index`
   - `search_index_context`
   - `collect_context`
   - `build_index`

4. Ujednolicic format wynikow narzedzi indeksu:
   - `status`
   - `query`
   - `mode`
   - `index_created_at`
   - `results` albo `files`
   - `stats`

5. Nie migrowac do FastMCP. Wykorzystac tylko sprawdzone wzorce.

## Decyzje

- Nie ruszac jeszcze struktury plikow na moduly JS.
- Najpierw ustandaryzowac odpowiedzi i schematy.
- Modularizacja plikow dopiero jako refactor v2.

## Po wdrozeniu

- Podmienic `C:\Work\mcp\server_tools.js` recznie z canvasa.
- Restart node.
- Usunac i dodac ponownie aplikacje tools w ChatGPT.
- Uruchomic `index_status`, `search_index`, `collect_context`.


## 2026-04-25 korekta

Użytkownik częściowo wkleił helpery `ok/fail/registerSafeTool` wewnątrz `readJson`, co psuje strukturę pliku. Przygotowano pełną, scaloną wersję `server_tools.js` v1.4.1 w canvasie: `server_tools_refactor_v1_full`.

Instrukcja: zastąpić cały `C:\Work\mcp\server_tools.js` treścią z canvasa, nie robić patchowania fragmentami.
