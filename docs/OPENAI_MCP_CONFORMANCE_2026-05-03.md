# OpenAI MCP / Apps Conformance Audit

Data: 2026-05-03
Status: canonical_current
Zakres: zgodność `C:\Work\mcp` z zasadami z `docs/openai_apps_mcp_extract.md` i `docs/openai_apps_mcp_research_v2.md`

## Metodologia

Ten dokument nie zakłada zgodności na podstawie samych deklaracji. Każdy werdykt opiera się wyłącznie na:

- kodzie runtime,
- kontraktach tooli,
- testach,
- istniejącej dokumentacji,
- lokalnych artefaktach tylko tam, gdzie są wyraźnie oznaczone jako dowód operacyjny, a nie source-of-truth.

Klasy werdyktu:

- `zgodne`
- `częściowo zgodne`
- `niezgodne`
- `niepotwierdzone`

## Matryca zgodności

| Zasada | Werdykt | Dowód | Uwagi |
|---|---|---|---|
| MCP transport powinien iść kierunkiem Streamable HTTP, a nie SSE | `zgodne` | `server_tools.js`, `server.js` używają `StreamableHTTPServerTransport` | Kierunek transportowy jest poprawny zarówno dla read-only, jak i tools profile. |
| Toole powinny mieć jawne `title` i `description` | `zgodne` | aktywne moduły runtime, `tests/mcp_contract_surface.test.js` | Test globalny pilnuje obecności i niepustych wartości. |
| Toole powinny mieć `readOnlyHint`, `destructiveHint`, `openWorldHint` | `zgodne` | aktywne moduły runtime, `tests/mcp_contract_surface.test.js` | Test globalny pilnuje typów boolean i podstawowej spójności. |
| `readOnlyHint` powinien odpowiadać faktycznej semantyce toola | `częściowo zgodne` | `tests/mcp_contract_surface.test.js`, aktywne moduły runtime | Test pilnuje read-only vs destructive; pełna semantyka każdego toola nadal wymaga review przy zmianach. |
| Wynik toola powinien rozdzielać `content`, `structuredContent`, `_meta`, `isError` | `częściowo zgodne` | `core/responses.js`, `tests/mcp_result_shape.test.js` | Helpery `ok`, `textOk`, `fail` mają bazowy test result-shape; `_meta` nie jest używane w aktywnym runtime. |
| `structuredContent` powinno być zwięzłe i nie duplikować bez potrzeby dużych payloadów | `częściowo zgodne` | `core/responses.js`, `core/science_tools.js`, `server.js` | `ok(data)` nadal duplikuje pełny JSON do `content` i `structuredContent`. |
| IO tools powinny mieć spójny contract danych | `zgodne` | `core/tools_fs.js`, `core/responses.js` | `read_file`, `read_file_lines`, `read_file_chunk` mają `outputSchema` i utrzymują `structuredContent.text`. |
| Toole powinny mieć `outputSchema`, gdy to praktyczne | `częściowo zgodne` | `core/tools_fs.js`, `tests/mcp_contract_surface.test.js` | `outputSchema` jest obecne tylko częściowo; test monitoruje partial coverage, ale jeszcze go nie wymusza globalnie. |
| Błędy tooli powinny być jawnie sygnalizowane przez `isError: true` | `zgodne` | `core/responses.js`, `tests/mcp_result_shape.test.js` | `fail()` jest objęty testem i ustawia `isError: true`. |
| Sekrety nie powinny trafiać do `content` ani `structuredContent` | `zgodne` | `core/auth.js`, `core/responses.js`, brak ścieżek zwracających token | Kod nie zwraca tokenu. Ryzyko jest operacyjne: token bywa umieszczany w URL tunelu. |
| Auth dla local connectora powinien być zgodny z realnym flow ChatGPT/tunnel | `zgodne` | `core/auth.js`, `server_tools.js`, dostarczone logi użytkownika | `MCP_TOKEN` działa przez query i bearer; to pokrywa potwierdzony flow z `cloudflared`. |
| Tool metadata Apps SDK `_meta[...]` dla widgetów/UI powinno być jawne, jeśli projekt deklaruje widget flow | `niezgodne` | brak `_meta` w aktywnych toolach i brak resource/widget runtime | Projekt nie implementuje obecnie warstwy widgetowej mimo że research docs ją omawiają. |
| Resource/widget metadata powinno istnieć tylko, jeśli rzeczywiście jest UI resource layer | `niepotwierdzone` | brak takiej warstwy w aktywnym runtime | Nie stwierdzono aktywnego UI/resource path. |
| `readOnlyHint` ma znaczenie dla approval flow i powinien być testowany | `zgodne` | `tests/mcp_contract_surface.test.js` | Test globalny pilnuje obecności annotations dla całego exposed tool surface. |
| Tool surface connectora powinien być ograniczony do bezpiecznego profilu | `częściowo zgodne` | `server_tools.js`, `core/code_tools_safe.js`, `core/registry_tools_safe.js` | Ekspozycja używa safe modułów; legacy `core/code_tools.js` nadal istnieje w repo, ale nie jest startup dependency. |
| Runtime production-safe nie powinien zależeć od legacy write-capable module, jeśli deklaruje safe profile | `zgodne` | `server_tools.js`, `core/recovery_rollback.js`, `tests/recovery_no_legacy_import.test.js` | Startup recovery został odseparowany od legacy; awaria `code_tools.js` nie powinna wpływać na start runtime. |
| Kontrakty i approval-safe semantyka powinny być utrzymywane testami | `częściowo zgodne` | `tests/registry_*.test.js`, `tests/mcp_contract_surface.test.js`, `tests/mcp_result_shape.test.js` | Jest bazowy guardrail descriptorów i helperów result-shape; nadal brak pełnych testów handlerów i e2e. |

## Najważniejsze luki zgodności

### 1. Brak warstwy `_meta` i resource/widget metadata

Research i ekstrakty OpenAI opisują pełniejszy model Apps SDK z widgetami i metadanymi `_meta`. Aktualny `C:\Work\mcp` nie implementuje tego aktywnie. To nie jest błąd sam w sobie, jeśli projekt nie deklaruje dziś warstwy widgetowej jako wdrożonej, ale oznacza niepełną zgodność z pełnym modelem Apps SDK.

### 2. `outputSchema` jest wdrożone tylko częściowo

Najbardziej dopracowane są bounded IO readers. Reszta tooli aktywnego runtime nadal opiera się na mniej formalnym kontrakcie wyników. Aktualny test kontraktu monitoruje partial coverage, ale nie wymusza pełnego `outputSchema` dla wszystkich tooli.

### 3. `content` bywa zbyt ciężkie i zbyt duplikacyjne

`core/responses.js` oraz część tooli nadal kopiują pełne JSON-y do kanału tekstowego `content`. To jest funkcjonalne, ale nie jest optymalne względem zaleceń o zwięzłym `content` i bardziej maszynowym `structuredContent`.

### 4. Testy result-shape obejmują helpery, nie wszystkie realne handlery

`tests/mcp_result_shape.test.js` pilnuje `ok`, `textOk` i `fail`, co zamyka bazowy kontrakt helperów. Nadal brakuje testów wywołujących reprezentatywne realne handlery tooli i sprawdzających ich wynik end-to-end.

## Zalecenia

1. Rozszerzyć `outputSchema` na pozostałe read-only toole oraz na najważniejsze state-changing wyniki.
2. Przerobić `ok(data)` tak, by `content` było krótkim podsumowaniem zamiast pełnego zrzutu JSON.
3. Dodać testy result-shape na reprezentatywnych rzeczywistych handlerach, nie tylko na helperach.
4. Nie opisywać w docs warstwy widgetowej jako aktywnej, dopóki w kodzie nie pojawi się realny resource/UI layer z `_meta`.
