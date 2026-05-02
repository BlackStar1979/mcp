# Audyt `C:\\Work\\mcp` względem OpenAI MCP / Apps / Connectors

Data: 2026-04-27
Status: roboczy, ale oparty o aktualnie sprawdzone dokumenty OpenAI Platform / Help Center / oficjalne przykłady.

## 1. Najważniejsza zmiana podejścia

Ten projekt trzeba audytować przede wszystkim jako MCP server dla OpenAI/ChatGPT, a nie jako zwykłe REST API.

Kolejność kryteriów:

1. Zgodność z OpenAI MCP / Connectors security model.
2. Tool descriptors: schema, title, annotations.
3. Approval/read-only behavior.
4. Result contract: `content`, `structuredContent`, `_meta`, `isError`.
5. Dopiero potem klasyczne hardening: path traversal, atomic write, limity, audit log.

## 2. Potwierdzone fakty z dokumentacji

### 2.1 Remote MCP / Connectors

OpenAI Platform opisuje MCP jako tool w Responses API oraz jako mechanizm custom connectors w ChatGPT.

Konfiguracja remote MCP / connector obejmuje m.in.:

- `type: "mcp"`,
- `server_label`,
- `server_url` albo `connector_id`,
- `server_description`,
- `authorization`,
- `headers`,
- `allowed_tools`,
- `require_approval`.

`authorization` to OAuth access token albo token do remote MCP servera przekazywany w żądaniu. `headers` mogą służyć do auth lub innych celów.

### 2.2 Approval i allowed_tools

OpenAI obsługuje approval flow dla MCP tools. `require_approval` może być `always`, `never` albo filtrem. Filtr może używać:

- `read_only`,
- `tool_names`.

`read_only` działa na podstawie MCP annotation `readOnlyHint`.

Wniosek: `readOnlyHint` nie jest kosmetyką. To wpływa na realne zachowanie OpenAI/ChatGPT przy dopuszczaniu automatycznych wywołań i approval.

### 2.3 ChatGPT custom connectors / developer mode

Help Center wskazuje, że full MCP connectors w ChatGPT są w beta, obejmują też modify/write actions i wyświetlają explicit confirmation modals przed write/modify actions.

Wniosek: poprawna klasyfikacja tooli jako read-only / state-changing / destructive jest krytyczna.

### 2.4 Wymagania review/submission

Dla tools wymagane są jawne annotations, szczególnie:

- `readOnlyHint`,
- `destructiveHint`,
- `openWorldHint`.

Praktycznie warto też ustawić `idempotentHint`.

## 3. Lokalny stan kodu

### 3.1 Dwa serwery / dwa profile

W katalogu `mcp` istnieją dwa istotne entrypointy/profilowe serwery:

1. `mcp/server.js`
   - `PORT = 3000`,
   - read-only server,
   - tools: `search`, `fetch`, `list_directory`, `read_file`, `get_info`,
   - brak auth,
   - start przez `npm start`, bo `package.json` ma `main: server.js` i `start: node server.js`.

2. `mcp/server_tools.js`
   - `PORT = 3001` z `config.js`,
   - auth przez `auth.js`,
   - rejestruje `registerIndexTools` i `registerFsTools`,
   - nie rejestruje aktualnie `registerScienceTools`, mimo że `science_tools.js` istnieje i narzędzia są widoczne po stronie aktualnie podpiętego runtime.

Wniosek: trzeba ustalić, który serwer jest właściwym runtime dla ChatGPT. Aktualny package wskazuje na `server.js`, ale narzędzia, które widzę jako `Lokalne pliki tools`, odpowiadają raczej `server_tools.js` + science layer. To wymaga uporządkowania.

### 3.2 Brak annotations

W `server.js`, `tools_fs.js`, `tools_index.js`, `science_tools.js` narzędzia mają zwykle `description` i `inputSchema`, ale nie mają pełnych MCP/OpenAI annotations.

To jest obecnie główna niezgodność.

### 3.3 Brak outputSchema

Większość tools nie ma `outputSchema`. To nie musi od razu blokować działania, ale pogarsza kontrakt i utrudnia walidację.

### 3.4 Result shape jest funkcjonalny, ale nieoptymalny

`responses.js`:

```js
export function ok(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}
```

Problem: dla dużych danych ten sam payload trafia jako tekst i structured JSON. To zwiększa tokeny i ryzyko przeciążenia kontekstu.

## 4. Klasyfikacja narzędzi

### 4.1 Read-only tools

Te narzędzia nie powinny zmieniać stanu i mogą mieć `readOnlyHint: true`:

```text
search
fetch
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

### 4.2 State-changing non-destructive / maintenance

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

Uwaga: `restore_path` z `overwrite=true` może być destructive; statyczny descriptor nie widzi argumentu. Bezpieczniejsza klasyfikacja: `destructiveHint: true`.

### 4.3 Destructive/high-risk

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

Uwaga: `write_file` jest destructive, bo overwrite pliku jest możliwy mimo backupu.

## 5. Proponowany projekt poprawek

### 5.1 Dodać helper descriptorów

Nowy plik:

```text
mcp/tool_descriptors.js
```

Przykład:

```js
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const STATE_CHANGING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export function toolConfig({ title, description, inputSchema, outputSchema, annotations, meta }) {
  const cfg = { title, description, inputSchema, annotations };
  if (outputSchema) cfg.outputSchema = outputSchema;
  if (meta) cfg._meta = meta;
  return cfg;
}
```

### 5.2 Dodać annotations do wszystkich tools

Minimalny patch: tylko dodać `title` i `annotations` bez zmiany logiki runtime.

### 5.3 Poprawić `responses.js`

Docelowo:

```js
export function ok(data, { text = null, meta = null } = {}) {
  const summary = text ?? summarize(data);
  const res = {
    content: [{ type: "text", text: summary }],
    structuredContent: data,
  };
  if (meta) res._meta = meta;
  return res;
}
```

Ale ostrożnie: zmiana `content` może wpłynąć na zachowanie aktualnych klientów. Najpierw testy.

### 5.4 Uporządkować entrypointy

Opcje:

A. `server.js` zostaje read-only knowledge connector.
B. `server_tools.js` zostaje full tools connector.
C. `package.json` dostaje osobne skrypty:

```json
{
  "scripts": {
    "start:knowledge": "node server.js",
    "start:tools": "node server_tools.js",
    "start": "node server_tools.js"
  }
}
```

Decyzja zależy od tego, który endpoint jest aktualnie tunelowany do ChatGPT.

## 6. Test plan

### 6.1 Contract tests

- list tools zwraca wszystkie oczekiwane narzędzia,
- każdy tool ma `title`, `description`, `inputSchema`, `annotations`,
- każdy tool ma jawne `readOnlyHint`, `destructiveHint`, `openWorldHint`,
- read-only tools są faktycznie read-only.

### 6.2 Approval classification tests

Tabela oczekiwań:

| Tool | readOnlyHint | destructiveHint |
|---|---:|---:|
| list_directory | true | false |
| read_file | true | false |
| search_index | true | false |
| build_index | false | false |
| write_file | false | true |
| delete_path | false | true |
| restore_path | false | true |

### 6.3 Runtime smoke tests

- `index_status`
- `list_directory .`
- `read_file reports/openai_apps_mcp_extract.md`
- `write_file reports/_mcp_smoke_test.md`
- `delete_path reports/_mcp_smoke_test.md`
- `restore_path` z metadanych trash

### 6.4 Regression tests dla bezpieczeństwa FS

- zapis do `mcp/server.js` z `allow_protected=false` blokowany,
- delete `mcp` blokowany,
- path escape poza `C:\\Work` blokowany,
- `.mcp_index`, `.mcp_backups`, `.mcp_trash` chronione przed write/delete.

## 7. Kolejność wykonania

1. Nie ruszać auth/tunelu.
2. Dodać `tool_descriptors.js`.
3. Dodać annotations do `server.js`, `tools_fs.js`, `tools_index.js`, `science_tools.js`.
4. Dodać test kontraktu descriptorów.
5. Dopiero po zielonych testach poprawiać `responses.js`.
6. Następnie uporządkować entrypointy i package scripts.
7. Potem klasyczny hardening FS.

## 8. Otwarte pytania

1. Który plik jest faktycznie uruchamiany przez aktualny tunnel: `server.js` czy `server_tools.js`?
2. Czy `science_tools.js` jest rejestrowany przez inny plik niż aktualnie czytany `server_tools.js`?
3. Czy ChatGPT connector widzi profile jako dwa różne serwery: `Lokalne pliki` i `Lokalne pliki tools`?
4. Czy po dodaniu annotations ChatGPT zmieni zachowanie confirmation modals dla write/delete?
