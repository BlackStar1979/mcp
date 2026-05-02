# OpenAI Apps SDK / MCP — ekstrakt roboczy

Data: 2026-04-27
Cel: baza do audytu `C:\\Work\\mcp` według dokumentacji OpenAI Apps/MCP, nie według intuicji REST API.

## Źródła

- OpenAI Developers: Apps SDK rozszerza ChatGPT aplikacjami opartymi o Model Context Protocol.
- OpenAI Help Center: custom apps buduje się przy użyciu MCP; Apps SDK jest rekomendowaną ścieżką pakowania i publikowania aplikacji.
- OpenAI `openai-apps-sdk-examples`: oficjalne przykłady MCP serverów i widgetów.
- OpenAI Agents SDK MCP docs: zalecane typy MCP: Hosted, Streamable HTTP, stdio; SSE jest legacy/deprecated.
- OpenAI API model docs: Responses API obsługuje MCP jako narzędzie w wybranych modelach.

## Model mentalny

Apps SDK nie jest zwykłym REST API. To ChatGPT jako host nad MCP:

1. MCP server listuje tools.
2. ChatGPT wywołuje tool z argumentami zgodnymi ze schematem.
3. Tool zwraca `content`, `structuredContent`, opcjonalnie `_meta`.
4. Widget/UI jest wiązany przez metadane tool/resource.
5. Serwer pozostaje autorytatywny dla walidacji i skutków ubocznych.

## Minimalna integracja

Według oficjalnych przykładów OpenAI serwer powinien obsłużyć:

- list tools,
- call tools,
- return widgets.

## Transport

Dla lokalnego/tunelowanego MCP właściwy kierunek to Streamable HTTP. Stdio jest alternatywą lokalną. SSE traktować jako legacy. Aktualny projekt używa `StreamableHTTPServerTransport`, więc kierunkowo jest dobrze.

## Tool descriptor — pola do sprawdzania

- `title`
- `description`
- `inputSchema`
- `outputSchema`
- `annotations.readOnlyHint`
- `annotations.destructiveHint`
- `annotations.idempotentHint`
- `annotations.openWorldHint`
- `_meta["openai/outputTemplate"]`
- `_meta["openai/toolInvocation/invoking"]`
- `_meta["openai/toolInvocation/invoked"]`
- `_meta["openai/widgetAccessible"]`
- `_meta["openai/visibility"]`
- `_meta["openai/fileParams"]`
- `_meta["securitySchemes"]` / per-tool auth metadata

Część pól to rozszerzenia Apps SDK, nie rdzeń MCP.

## Wynik narzędzia

Kanały danych:

1. `content` — widoczne dla modelu/użytkownika, tekst/markdown.
2. `structuredContent` — widoczne dla modelu i widgetu, zwięzły JSON, najlepiej zgodny z `outputSchema`.
3. `_meta` — dane UI-only/host-only; nie traktować jako miejsca na sekrety.

Zasada: model dostaje tylko to, co potrzebne do rozmowy. Duże dane i dane techniczne kierować do `_meta`, jeśli są potrzebne widgetowi.

## Auth

Nie przenosić automatycznie reguł publicznego REST API na lokalny connector. Dla `Lokalne pliki tools` sekret środowiskowy i tunel są częścią development/local connection. Audyt auth musi rozróżnić:

- autoryzację transportu do lokalnego MCP,
- autoryzację użytkownika do danych,
- per-tool authorization.

Nadal: nie logować sekretów, nie wystawiać ich w `content` ani `structuredContent`, walidować uprawnienia po stronie serwera.

## Widget bridge

Widgety Apps SDK używają host bridge `window.openai`. Kod UI powinien sprawdzać dostępność metod, bo nie każdy host wspiera pełny zestaw.

Typowe obszary:

- `toolInput`,
- `toolOutput`,
- `toolResponseMetadata`,
- `widgetState`,
- `setWidgetState`,
- `callTool`,
- `sendFollowUpMessage`,
- display/layout helpers.

## Checklist dla `C:\\Work\\mcp`

Pliki do audytu:

- `mcp/server_tools.js`
- `mcp/responses.js`
- `mcp/auth.js`
- `mcp/tools_fs.js`
- `mcp/tools_index.js`
- `mcp/science_tools.js`
- `mcp/config.js`
- `mcp/paths.js`

Pytania:

- Czy każdy tool ma sensowny `title` i `description`?
- Czy read-only tools mają `readOnlyHint: true`?
- Czy write/delete/move/restore mają poprawne destructive/idempotent hints?
- Czy output jest spójny: `content`, `structuredContent`, `_meta`, `isError`?
- Czy `structuredContent` nie zawiera niepotrzebnie dużych payloadów?
- Czy błędy są zwracane jako `isError: true`?
- Czy są output schemas tam, gdzie to ma sens?
- Czy auth pasuje do ChatGPT Apps/local connector, a nie tylko do intuicji REST?
- Czy maintenance flow dla `mcp` jest zaprojektowany świadomie?

## Wniosek operacyjny

Kolejność dalszego audytu:

1. MCP/Apps contract.
2. Tool descriptors.
3. Tool result shape.
4. Auth w kontekście local connector / Apps SDK.
5. Dopiero potem klasyczny hardening FS: path traversal, atomic write, limits, backups, audit.
