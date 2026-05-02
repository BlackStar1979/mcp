# OPENAI APPS / MCP — FRAMEWORK ROBOCZY DLA LOKALNEGO MCP

Data: 2026-04-26

## Cel dokumentu

Zebrać zasady developerskie istotne dla lokalnego MCP w `C:\Work\mcp`, aby kolejne modyfikacje nie łamały kontraktu Apps SDK / MCP i żeby nie mieszać kanałów danych.

Źródła publiczne sprawdzone 2026-04-26:

- OpenAI Developers — Apps SDK i MCP jako warstwa budowania aplikacji ChatGPT na Model Context Protocol.
- OpenAI Agents SDK — MCP: Hosted MCP, Streamable HTTP, stdio, tool filtering, cache tools list, approvals, tracing.
- OpenAI Agents SDK Python — MCP tool outputs, `_meta`, per-call metadata, `use_structured_content`.

## 1. Podstawowa architektura

W aktualnym projekcie lokalny MCP działa jako Streamable HTTP server:

```text
ChatGPT / Aplikacja
  -> Streamable HTTP MCP
  -> C:\Work\mcp\server_tools.js
  -> moduły narzędziowe
```

Aktualne moduły:

```text
server_tools.js       entrypoint MCP/Express
config.js             konfiguracja, limity, ścieżki
paths.js              safePath, toRel, blokady zapisu
responses.js          format odpowiedzi narzędzi
 tools_fs.js          filesystem i tekst
 tools_index.js       indeks
 science_tools.js     dane naukowe
 fits_info.py         backend astropy
 hdf5_info.py         backend h5py
 table_profile.py     backend profilu tabel tekstowych
```

## 2. Kanały odpowiedzi narzędzia

Wynik narzędzia MCP może zawierać m.in.:

```js
{
  content: [{ type: "text", text: "..." }],
  structuredContent: { ... },
  _meta: { ... }
}
```

Zasada lokalna:

- `content` — tekst przeznaczony dla modelu / widoczny wynik narzędzia.
- `structuredContent` — dane strukturalne, krótkie i maszynowe; powinny odpowiadać kontraktowi narzędzia.
- `_meta` — dane pomocnicze dla klienta / komponentu / integracji; nie traktować jako podstawowego kanału dla modelu.

Nie należy wkładać dużych pełnych tekstów lub dużych tablic do `structuredContent` tylko po to, żeby ominąć problem prezentacji. Dla dużych danych należy projektować narzędzia zakresowe, próbkujące albo inspekcyjne.

## 3. Schematy wejścia i wyjścia

Każde narzędzie powinno mieć jawny `inputSchema`. Obecnie używany jest `z.object(...)`.

Zalecenie dalsze:

- dla narzędzi zwracających trwały format dodać `outputSchema`, o ile SDK/adapter w tej konfiguracji go obsługuje stabilnie;
- `structuredContent` powinien być zgodny z deklarowanym output schema;
- narzędzia tekstowe powinny zwracać tekst w `content`, a metadane w `structuredContent`.

## 4. Adnotacje i bezpieczeństwo narzędzi

W standardzie MCP / OpenAI Apps SDK narzędzia mogą używać adnotacji typu:

```js
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
}
```

Lokalna polityka:

- narzędzia inspekcyjne (`inventory_tree`, `fits_info`, `hdf5_info`, `table_profile`, `read_file_lines`, `read_file_chunk`) powinny być read-only;
- narzędzia modyfikujące (`write_file`, `append_file`, `copy_path`, `move_path`, `delete_path`, `restore_path`) wymagają ostrożnej polityki approval / blokad ścieżek;
- operacje destrukcyjne muszą pozostać soft-delete albo wymagać jawnej zgody.

## 5. Transport i lifecycle

OpenAI Agents SDK rozróżnia m.in.:

- hosted MCP tools,
- Streamable HTTP MCP servers,
- stdio MCP servers.

Ten projekt używa Streamable HTTP lokalnie. To jest właściwe dla lokalnego serwera MCP używanego przez Aplikację.

Ważne:

- po zmianie listy narzędzi wymagany jest restart MCP i odświeżenie listy narzędzi po stronie klienta;
- cache listy narzędzi może powodować wrażenie, że nowe narzędzia nie istnieją;
- w środowiskach agentowych można filtrować listę narzędzi albo cachować `list_tools()` — uważać przy testach.

## 6. Duże pliki tekstowe

Dla dużych tekstów nie używać pełnego `read_file`.

Zasada:

```text
read_file_lines  -> cięcie po liniach
read_file_chunk  -> fallback po offsetach znakowych
read_file        -> mały plik albo prefiks
```

Przykład: `C:\Work\inspirational\chat.txt` ma 4215 linii i 294990 bajtów. Dla niego obowiązuje workflow z dokumentu:

```text
C:\Work\.mcp_notes\INSPIRATIONAL_CHAT_WORKFLOW.md
```

## 7. Dane naukowe

Dla `.fits`, `.fit`, `.fits.gz`, `.h5`, `.hdf5`, dużych `.gz`, PDF i tabel nie wolno projektować narzędzi jako pełny odczyt.

Zasada:

```text
inventory_tree   -> mapa katalogu, typy, rozmiary, największe pliki
fits_info        -> HDU, header, kolumny, shape, dtype
hdf5_info        -> grupy, datasety, shape, dtype, chunking, compression, attrs
table_profile    -> profil tabel tekstowych
```

Python backend jest właściwym kierunkiem dla danych naukowych:

```text
astropy -> FITS
h5py    -> HDF5
numpy   -> backend numeryczny
```

Node.js powinien pełnić rolę orchestratora MCP, nie parsera naukowych formatów binarnych.

## 8. Zasady projektowania kolejnych narzędzi

Każde nowe narzędzie powinno spełniać:

1. Mały, jawny kontrakt wejścia.
2. Limit rozmiaru odpowiedzi.
3. Odczyt zakresowy lub próbkujący, nigdy bezwarunkowe ładowanie całości dużego pliku.
4. `content` dla krótkiego czytelnego wyniku.
5. `structuredContent` dla metadanych i małych struktur.
6. Python backend dla ciężkich formatów naukowych.
7. Bezpieczeństwo ścieżek przez `safePath`.
8. Brak zapisu do chronionych katalogów bez świadomej decyzji.

## 9. Znane uwagi integracyjne

- Wrapper może prezentować głównie `structuredContent`; nie oznacza to, że `content.text` nie istnieje.
- Przy dużych wynikach `structuredContent` może stać się problemem kontekstowym.
- HDF5 z atrybutami może zostać zablokowany przez warstwę bezpieczeństwa lub wygenerować zbyt duży wynik — domyślnie testować z `include_attrs=false` albo niskim `max_items`.
- Narzędzia Python powinny zawsze zwracać poprawny JSON na stdout i błędy na stderr.

## 10. Minimalny standard dokumentowania narzędzia

Dla każdego narzędzia zapisać:

```text
Nazwa:
Cel:
Plik/moduł:
Backend:
Wejście:
Wyjście:
Limity:
Ryzyka:
Przykład testowy:
Status:
```


---

## 11. Known integration issue — content not visible to agent

Problem observed:

- MCP tools correctly return `content.text`
- but some wrappers / agents only expose `structuredContent`
- result: agent sees metadata but NOT text

Impact:

- blocks pipelines based on textual extraction (e.g. hypothesis extraction)

Solution (implemented 2026-04-26):

- for bounded outputs (read_file, read_file_lines, read_file_chunk)
  - duplicate text into `structuredContent.text`
  - additionally include structured representation (`lines[]` for line-based tools)

Rationale:

- text is bounded by explicit limits (max_chars)
- therefore safe to include in structuredContent
- restores compatibility with agents that ignore `content`

Trade-off:

- slight duplication of data
- but removes hard blocker in IO layer

Rule:

```text
If downstream agent does not see content → include bounded text also in structuredContent
```

This is an integration workaround, not a pure-spec ideal.
