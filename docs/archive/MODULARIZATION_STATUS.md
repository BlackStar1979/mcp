# MODULARIZATION STATUS

Data: 2026-04-25

## Cel
`server_tools.js` ma być lekkim kontenerem, a cała logika ma być rozbita na moduły.

## Aktualny status

### Wdrożone i przetestowane

- `server_tools.js` jako lekki entrypoint MCP/Express.
- `config.js` — konfiguracja, limity, ścieżki, blokady.
- `auth.js` — autoryzacja tokenem.
- `responses.js` — `ok`, `fail`, `textOk`, `registerSafeTool`.
- `paths.js` — `safePath`, `toRel`, `assertWritablePath`.
- `audit.js` — logowanie operacji do `.mcp_audit.log`.
- `indexer.js` — obsługa indeksu.
- `tools_index.js` — narzędzia indeksu.
- `fs_ops.js` — operacje pomocnicze filesystemu: backup, trash, JSON helpery.
- `tools_fs.js` — komplet narzędzi plikowych.

### Aktualny staging

Pełny modularny zestaw znajduje się w:

```text
C:\Work\_mcp_next
```

Do wdrożenia należy kopiować pliki z:

```text
C:\Work\_mcp_next\*
```

do:

```text
C:\Work\mcp\
```

## Obecny komplet narzędzi filesystemu

- `list_directory`
- `get_info` — UWAGA: w modularnym `tools_fs.js` należy jeszcze potwierdzić czy jest zaimplementowane; jeżeli nie, dodać przed finalnym porządkiem.
- `read_file`
- `write_file`
- `append_file`
- `copy_path`
- `move_path`
- `delete_path`
- `restore_path`

## Obecny komplet narzędzi indeksu

- `index_status`
- `build_index`
- `search_index`
- `search_index_context` — UWAGA: w minimalnym modularnym `tools_index.js` może wymagać ponownego przeniesienia z monolitu.
- `collect_context` — UWAGA: w minimalnym modularnym `tools_index.js` może wymagać ponownego przeniesienia z monolitu.

## Ważne ostrzeżenie

W pierwszym etapie modularizacji powstała wersja minimalna, która zawierała tylko część narzędzi indeksu. Nie traktować jej jako finalnej.

Przed uznaniem modularizacji za zakończoną trzeba sprawdzić:

1. `list_directory`
2. `get_info`
3. `read_file`
4. `write_file`
5. `append_file`
6. `copy_path`
7. `move_path`
8. `delete_path`
9. `restore_path`
10. `index_status`
11. `build_index`
12. `search_index`
13. `search_index_context`
14. `collect_context`

## Zasada wdrożeniowa

Nie patchować fragmentami w produkcyjnym `C:\Work\mcp`.

Najpierw przygotowywać pełne pliki w:

```text
C:\Work\_mcp_next
```

Potem ręcznie kopiować do:

```text
C:\Work\mcp
```

## Następny krok

1. Upewnić się, że `tools_index.js` zawiera pełny zestaw: `search_index_context` i `collect_context`.
2. Upewnić się, że `tools_fs.js` zawiera `get_info`.
3. Skopiować `_mcp_next` do `mcp`.
4. Restart `node server_tools.js`.
5. Przetestować pełną listę narzędzi.


---

## 2026-04-25 — test pełnego FS layer

Przetestowano po modularizacji:

- `append_file` — OK, tworzy backup przy dopisywaniu.
- `copy_path` — OK.
- `move_path` — OK.
- `delete_path` — OK, soft-delete do `.mcp_trash`.
- `restore_path` — OK, przywraca z `.mcp_trash` przy użyciu metadata.

Wniosek: FS layer jest funkcjonalnie domknięty.

## Status po testach

```text
FS layer        100%
Index layer     działa, ale scoring w wersji modularnej jest uproszczony
Audit           działa
Backup          działa
Trash/restore   działa
Modularizacja   działa
```

## Bez agentów AI — następny etap techniczny

Zanim powstanie warstwa workflow/agentowa, trzeba domknąć warstwę techniczną:

1. Uporządkować pliki testowe po testach FS.
2. Doprowadzić `tools_index.js` do pełnego parity z monolitem:
   - ranking weighted/tokens/exact,
   - snippety,
   - line context,
   - collect_context z limitami.
3. Dodać prosty test smoke checklist.
4. Dopisać README dla `C:\Work\mcp`.
5. Dopiero potem rozważać workflow/analizę.


---

## 2026-04-26 — narzędzia zakresowego odczytu plików

Dodano i po restarcie Aplikacji potwierdzono obecność narzędzi:

- `read_file_lines` — odczyt zakresu linii 1-based, np. `start_line=1`, `end_line=40`.
- `read_file_chunk` — odczyt fragmentu tekstu po offsetach znakowych, fallback dla dużych lub nieliniowych plików.

Zmieniono kontrakt `read_file`:

- pozostaje narzędziem do małych plików lub prefiksu dużego pliku,
- dla większych plików ma zwracać ograniczony prefiks,
- do precyzyjnego cięcia używać `read_file_lines` albo `read_file_chunk`.

Dodano limity w `config.js`:

```js
export const MAX_READ_FILE_CHARS = 30000;
export const MAX_READ_LINES_CHARS = 50000;
export const MAX_READ_CHUNK_CHARS = 50000;
```

Testy wykonane po restarcie:

1. `read_file_lines` na `mcp/tools_fs.js`, zakres `L1-L20`:
   - plik rozpoznany,
   - `bytes=13514`,
   - `total_lines=418`,
   - `returned_lines=20`,
   - `returned_chars=692`,
   - `truncated=false`.

2. `read_file_chunk` na `mcp/tools_fs.js`, `offset=0`, `length=500`:
   - plik rozpoznany,
   - `bytes=13514`,
   - `chars=13514`,
   - `returned_chars=500`,
   - `next_offset=500`,
   - `has_more=true`.

Uwaga techniczna: w wywołaniach przez aktualny wrapper `api_tool` widoczny jest głównie `structuredContent`; należy jeszcze zweryfikować w samej Aplikacji, czy `content.text` narzędzi `read_file_lines` i `read_file_chunk` jest prawidłowo przekazywany do modelu. Po stronie implementacji wynik jest zwracany przez `textOk(returnedText, meta)`, czyli tekst powinien iść w `content`, a metadane w `structuredContent`.

Aktualny zalecany workflow dla dużych plików:

1. `get_info` albo `read_file` z małym `max_chars` dla rozpoznania pliku.
2. `read_file_lines` dla precyzyjnego zakresu, np. `L1-L200`, `L201-L400`.
3. `read_file_chunk` tylko jako fallback dla plików bez sensownej struktury liniowej.

Status: wdrożone do testów; wymaga potwierdzenia widoczności `content.text` w Aplikacji.


---

## 2026-04-26 — workflow dla `inspirational/chat.txt`

Utworzono osobny dokument operacyjny:

```text
C:\Work\.mcp_notes\INSPIRATIONAL_CHAT_WORKFLOW.md
```

Zakres dokumentu:

- opis problemu dużego pliku `C:\Work\inspirational\chat.txt`,
- potwierdzone parametry pliku: 4215 linii, 294990 bajtów,
- plan cięcia po 200 linii,
- zasady tworzenia mapy pliku,
- format przekształcania stwierdzeń w hipotezy,
- instrukcja dla agenta korzystającego z `read_file_lines`.

Zalecenie: agent analizujący `chat.txt` nie powinien używać pełnego `read_file`; podstawowym narzędziem roboczym jest `read_file_lines`.
