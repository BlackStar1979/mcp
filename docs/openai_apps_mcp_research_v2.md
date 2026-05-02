# OpenAI Apps SDK / MCP — research v2

Data: 2026-04-27
Zakres: dokumentacja OpenAI Developers / Platform / Help Center oraz oficjalne przykłady Apps SDK, z naciskiem na audyt `C:\\Work\\mcp`.

## 1. Fakty źródłowe

### 1.1 OpenAI Developer Docs MCP

OpenAI udostępnia publiczny MCP server dokumentacji developerskiej:

```text
https://developers.openai.com/mcp
```

To jest streamable HTTP MCP server do wyszukiwania i czytania dokumentacji developers.openai.com oraz platform.openai.com. Jest read-only i documentation-only.

Wniosek: w dalszym utrzymaniu projektu warto dodać ten server do środowiska dev jako źródło prawdy dla OpenAI API / Apps SDK / MCP.

### 1.2 Remote MCP w Responses API

OpenAI Platform opisuje `tools: [{ type: "mcp", ... }]` jako sposób podłączenia remote MCP serverów lub connectorów. Kluczowe pola:

- `type: "mcp"`
- `server_label`
- `server_url` albo `connector_id`
- `server_description`
- `allowed_tools`
- `authorization`
- `headers`
- `require_approval`

`allowed_tools` może być listą nazw albo filtrem:

```json
{
  "read_only": true,
  "tool_names": ["search", "fetch"]
}
```

`read_only` opiera się na `readOnlyHint` z MCP tool annotations.

### 1.3 Approval flow

Domyślnie OpenAI żąda approval przed przekazaniem danych do remote MCP servera. `require_approval` może być:

- `always`
- `never`
- obiektem z filtrami `always` / `never`

Wniosek: poprawne `readOnlyHint` ma znaczenie operacyjne, bo jest używane do filtrowania narzędzi i approval policy.

### 1.4 ChatGPT custom MCP apps / Developer mode

OpenAI Help Center wskazuje, że pełne MCP apps w ChatGPT są w beta i obejmują read/search oraz write/modify actions w zależności od planu. Custom MCP apps mogą wykonywać write/modify actions, ale publikacja i dostęp podlegają kontroli workspace/admin.

Ważne punkty:

- write/modify actions powodują confirmation modals w ChatGPT,
- apps mogą być publikowane dla workspace po weryfikacji,
- Business / Enterprise / Edu mają inne możliwości niż Pro,
- lokalny MCP server nie jest obecnie wspierany bezpośrednio w ChatGPT jako remote app; potrzebny jest remote endpoint/tunnel.

### 1.5 Submission / review — annotations są wymagane

OpenAI Help Center dla submitowania apps wskazuje, że wymagane jest ustawienie dla wszystkich tools:

- `readOnlyHint`
- `destructiveHint`
- `openWorldHint`

Interpretacja:

- `readOnlyHint: true` tylko dla narzędzi, które wyłącznie pobierają/listują/odczytują dane i niczego nie zmieniają.
- `readOnlyHint: false` dla tworzenia, aktualizacji, usuwania, logowania, uruchamiania workflow, kolejkowania zadań itd.
- `destructiveHint: true` dla działań nieodwracalnych albo potencjalnie destrukcyjnych: delete, overwrite, revoke, irreversible send/transaction/admin.
- `openWorldHint: true` dla działań wpływających na publiczny/internetowy stan albo systemy poza prywatnym/first-party kontekstem.

Wniosek: lokalne narzędzia `write_file`, `append_file`, `copy_path`, `move_path`, `delete_path`, `restore_path`, `build_index` muszą mieć jawne annotations.

## 2. Apps SDK metadata — roboczy model

### 2.1 Tool descriptor metadata

Pola znane z oficjalnych przykładów i dokumentacji Apps SDK:

```js
_meta: {
  "openai/outputTemplate": "ui://widget/name.html",
  "openai/toolInvocation/invoking": "...", // max ok. 64 chars wg praktyki ekosystemu
  "openai/toolInvocation/invoked": "...",
  "openai/widgetAccessible": true,
  "securitySchemes": [...]
}
```

`openai/outputTemplate` wskazuje zasób UI. Resource powinien mieć MIME type:

```text
text/html+skybridge
```

### 2.2 Resource metadata

Typowe pola:

```js
_meta: {
  "openai/widgetDescription": "...",
  "openai/widgetPrefersBorder": true,
  "openai/widgetCSP": {
    connect_domains: [],
    resource_domains: []
  },
  "openai/widgetDomain": "..."
}
```

### 2.3 Tool result

Tool result powinien rozdzielać dane:

```js
{
  content: [{ type: "text", text: "..." }],
  structuredContent: { ... },
  _meta: { ... },
  isError: false
}
```

Kanały:

- `content`: tekst widoczny dla modelu/użytkownika.
- `structuredContent`: zwięzłe dane dla modelu i widgetu, najlepiej zgodne z `outputSchema`.
- `_meta`: dane dla host/widget, nie dla modelu; nie wkładać sekretów.
- `isError`: sygnalizacja błędu narzędzia.

Wniosek dla aktualnego `responses.js`: obecne `ok(data)` dubluje cały JSON w `content` i `structuredContent`. To działa, ale jest kosztowne i może pogarszać zachowanie modelu dla dużych wyników.

## 3. Konsekwencje dla `C:\\Work\\mcp`

### 3.1 Najważniejsza niezgodność: brak annotations

Aktualne tools w `mcp/tools_fs.js`, `mcp/tools_index.js`, `mcp/science_tools.js` mają `description` i `inputSchema`, ale nie mają jawnych:

- `title`,
- `annotations.readOnlyHint`,
- `annotations.destructiveHint`,
- `annotations.openWorldHint`,
- `annotations.idempotentHint`,
- `outputSchema`.

Priorytet: dodać annotations dla każdego toola.

### 3.2 Klasyfikacja tools

#### Read-only tools

```text
get_info
list_directory
read_file
read_file_lines
read_file_chunk
index_status
search_index
search_index_context
collect_context
collect_romionsim_context
inventory_tree
fits_info
hdf5_info
table_profile
```

Proponowane annotations:

```js
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}
```

Uwaga: `inventory_tree` czyta dużo filesystemu, ale nie zmienia stanu.

#### State-changing but not inherently destructive

```text
build_index
append_file
copy_path
restore_path
```

Proponowane annotations:

```js
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
}
```

Uwaga: `restore_path` może nadpisać przy `overwrite=true`, więc może wymagać dynamicznie ostrzejszego traktowania, ale descriptor jest statyczny. Bezpieczniej można dać `destructiveHint: true`.

#### Destructive/high-risk tools

```text
write_file
move_path
delete_path
```

Proponowane annotations:

```js
annotations: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
}
```

`write_file` jest destrukcyjne, bo overwrite istniejącego pliku może zniszczyć stan, mimo backupu.

### 3.3 Auth

Nie usuwać mechaniki token/tunnel bez sprawdzenia runtime ChatGPT Apps. Dla lokalnego projektu najpierw trzeba zachować połączenie z ChatGPT. Hardening auth ma być kompatybilny:

- token nie może być logowany,
- Bearer/header jest czystszy dla stałego ruchu,
- query token może pozostać jako bootstrap, jeśli ChatGPT/dev connector tego wymaga,
- autoryzacja nie może opierać się na client-provided hints.

### 3.4 Results shape

Obecny `responses.js`:

```js
content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
structuredContent: data
```

Problem: duże dane są podwójnie wysyłane do modelu.

Lepszy kierunek:

- `ok(data, summary?)` — content zawiera krótkie streszczenie,
- `structuredContent` zawiera maszynowy wynik,
- duże payloady przenieść do `_meta` albo zwracać przez read_chunk/read_lines,
- dla read_file content może być tekstem, ale structuredContent powinno mieć metadane + ewentualnie bounded text, nie powielony gigantyczny obiekt.

## 4. Plan techniczny

### Faza A — dokumentacja/spec lock

1. Utrzymać ten plik jako research note.
2. Dodać `reports/mcp_apps_sdk_audit.md` jako właściwy audyt lokalnego kodu.
3. Przygotować mapę tool → annotations → outputSchema.

### Faza B — minimalny patch zgodności

1. Dodać helper do budowania descriptorów, np. `toolConfig(...)`.
2. Dodać `title` i `annotations` do wszystkich tools.
3. Dodać output schemas dla tools o stabilnym wyniku.
4. Poprawić `responses.js`, żeby nie dublował wielkich payloadów.

### Faza C — safety / hardening

1. Dopiero po zgodności Apps/MCP: atomic write, path rules, copy limits, index limits.
2. Nie ruszać token/tunnel bez testu połączenia ChatGPT.
3. Dodać smoke tests dla MCP inspector/ChatGPT dev mode.

## 5. Testy, które trzeba dodać

### Contract tests

- lista tools zawiera wszystkie oczekiwane nazwy,
- każdy tool ma `title`, `description`, `inputSchema`, `annotations`,
- każdy tool ma jawny `readOnlyHint`, `destructiveHint`, `openWorldHint`,
- read-only filter powinien zwracać tylko narzędzia bez skutków ubocznych.

### Result tests

- `ok` zwraca poprawny MCP result,
- `fail` zwraca `isError: true`,
- `textOk` nie dubluje zbędnie dużych danych,
- read_file/read_chunk/read_lines mają przewidywalny shape.

### Runtime tests

- MCP list tools przez inspector,
- MCP call get_info/list_directory/read_file,
- MCP call write_file z bezpiecznym path,
- MCP call delete_path wymaga approval w ChatGPT, jeśli host respektuje annotations.

## 6. Decyzje projektowe

1. Nie traktować MCP Apps jak zwykłego REST API.
2. Najpierw descriptors i result shape, potem hardening FS.
3. Query token nie jest automatycznie błędem, jeśli pełni rolę bootstrap w local/tunnel flow.
4. `readOnlyHint`, `destructiveHint`, `openWorldHint` są obowiązkowe operacyjnie dla ChatGPT Apps review i approval behavior.
5. `write_file` jest destructive, nawet z backupem.
6. `build_index` nie jest read-only, bo zapisuje `.mcp_index/index.json`.
