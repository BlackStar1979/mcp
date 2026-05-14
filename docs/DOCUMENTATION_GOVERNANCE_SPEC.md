# Documentation Governance Spec

Data: 2026-05-14
Status: canonical_current
Zakres: nadrzędna specyfikacja prowadzenia dokumentacji dla `C:\Work\mcp`

## Cel

Ten plik definiuje porządek dokumentacji. Ma usunąć trzy chroniczne problemy:

- zbyt wiele plików mówiących o tym samym,
- mieszanie stanu bieżącego, historii, planu i incydentów,
- brak jednej reguły mówiącej, który dokument ma pierwszeństwo.

To jest dokument nadrzędny dla `docs/`.

## Globalna hierarchia źródeł prawdy

Kolejność pierwszeństwa:

1. aktywny runtime i kod
2. testy aktywnego runtime
3. dokumenty `canonical_current`
4. dokumenty `current_reference`
5. dokumenty `current_plan`
6. dokumenty `incident_reference`
7. dokumenty `historical_reference`

Wniosek:

- dokument nie może nadpisać prawdy runtime,
- plan nie może być czytany jak wdrożenie,
- incydent nie może być czytany jak aktualna architektura.

## Obowiązkowe role dokumentów

Każdy dokument w `docs/` musi należeć do jednej z ról:

- `canonical_current`
- `current_reference`
- `current_plan`
- `incident_reference`
- `historical_reference`
- `staging_reference`
- `contradicted_in_part`

Jeśli nie da się tego powiedzieć jednym zdaniem, dokument jest źle nazwany albo źle umieszczony.

## Canonical set

To jest minimalny zestaw, od którego zaczyna się czytanie projektu:

1. `docs/README.md`
2. `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`
3. `docs/CURRENT_STATE.md`
4. `docs/RUNTIME_CONTRACTS_CURRENT.md`
5. `docs/ROADMAP_REGISTRY_EXECUTION.md`
6. `docs/MCP_OPERATOR_MANUAL.md`
7. `docs/DOCS_CATALOG.md`

Dokumenty uzupełniające canonical/reference:

- `docs/reference/REGISTRY.md`
- `docs/reference/PYTHON_RUNTIME_REQUIREMENTS.md`
- `docs/reference/KNOWN_ISSUES_CONNECTOR_LAYER.md`
- `docs/reference/LLM_EXECUTION_BRIEF.md`
- `docs/reference/MCP_DOCS_NORMALIZATION_AND_EDITORIAL_REDACTION_STRATEGY.md`

## Do czego służy każdy dokument canonical

- `README.md`
  - krótki entry point i mapa czytania
- `DOCUMENTATION_GOVERNANCE_SPEC.md`
  - reguły dokumentacyjne i hierarchia autorytetu
- `CURRENT_STATE.md`
  - tylko stan bieżący i potwierdzone checkpoints
- `RUNTIME_CONTRACTS_CURRENT.md`
  - kontrakty, granice i aktywny tool surface
- `ROADMAP_REGISTRY_EXECUTION.md`
  - wyłącznie plan i kolejność prac
- `MCP_OPERATOR_MANUAL.md`
  - praktyka operatorska i workflow zmian
- `DOCS_CATALOG.md`
  - pełna klasyfikacja wszystkich plików docs

## Reguła pojedynczej odpowiedzialności dokumentu

Każdy dokument ma dominującą funkcję:

- stan,
- kontrakt,
- plan,
- operacje,
- incydent,
- historia,
- research.

Nie wolno mieszać tych warstw bardziej niż to absolutnie konieczne.

Przykłady:

- `CURRENT_STATE.md` nie powinien być dziennikiem roadmapy.
- `ROADMAP_REGISTRY_EXECUTION.md` nie powinien być głównym opisem runtime.
- `MCP_OPERATOR_MANUAL.md` nie powinien być historią incydentów.
- `INCIDENT_*` nie powinien być czytany jako aktualna instrukcja systemowa.

## Reguła duplikacji

Jeśli ta sama informacja musi pojawić się w więcej niż jednym miejscu:

- tylko jedno miejsce jest źródłem głównym,
- w pozostałych miejscach ma być skrót albo odwołanie,
- nie wolno utrzymywać dwóch równorzędnych pełnych opisów tej samej rzeczy.

Preferowane źródła główne:

- runtime/tool surface -> `RUNTIME_CONTRACTS_CURRENT.md`
- bieżące wdrożone capability -> `CURRENT_STATE.md`
- plan kolejnych prac -> `ROADMAP_REGISTRY_EXECUTION.md`
- operator workflow -> `MCP_OPERATOR_MANUAL.md`

## Reguła statusów i zamykania

Każdy większy etap pracy musi być oznaczony jako:

- `OPEN`
- `IN_PROGRESS`
- `CLOSED`
- `POSTPONED`
- `CANCELLED`

Jeśli coś zostało zrealizowane, musi być odznaczone jako zrealizowane w planie i w stanie.

Minimalne miejsca synchronizacji po większej zmianie:

- `CURRENT_STATE.md`
- `RUNTIME_CONTRACTS_CURRENT.md`
- `ROADMAP_REGISTRY_EXECUTION.md`
- ewentualnie `MCP_OPERATOR_MANUAL.md`, jeśli zmienił się workflow operatorski

## Reguła incydentów

Incydent dostaje osobny plik tylko wtedy, gdy:

- błąd był realny i potwierdzony,
- ma wartość trwałej lekcji,
- nie da się go sensownie zamknąć jednym akapitem w stanie lub kontraktach.

Po zapisaniu incydentu jego wniosek musi zostać skondensowany do:

- `CURRENT_STATE.md`
  albo
- `RUNTIME_CONTRACTS_CURRENT.md`

Incydent nie może być jedynym miejscem, w którym siedzi ważna reguła projektu.

## Reguła historii i archiwum

Dokumenty historyczne nie muszą znikać, ale muszą być jawnie zdegradowane.

To oznacza:

- status w `DOCS_CATALOG.md`,
- ostrzeżenie w samym pliku, jeśli łatwo go pomylić z current truth,
- przeniesienie do `docs/archive/`, jeśli plik nie pełni już roli bieżącej referencji.

## Reguła nowych dokumentów

Nowy dokument można dodać tylko wtedy, gdy z góry wiadomo:

- po co istnieje,
- do której klasy należy,
- kto ma go czytać,
- który dokument canonical ma z nim relację nadrzędną.

Preferencja:

- dopisywać do istniejących canonical docs,
- a nie tworzyć nowy plik przy każdym odkryciu.

## Reguła dla kolejnych modeli i agentów

Jeśli wiedza jest ważna i ma wpływ na następne decyzje:

- ma zostać zapisana w docs,
- nie może zostać tylko w rozmowie,
- nie może zostać tylko w pamięci jednego modelu.

To dotyczy szczególnie:

- findings z testów,
- lekcji z CI,
- ograniczeń ChatGPT Desktop,
- granic auth,
- reguł bezpieczeństwa,
- wymagań operatorskich.

## Minimalna checklista po większej zmianie

1. Czy runtime i testy potwierdzają zmianę.
2. Czy `CURRENT_STATE.md` odnotowuje wynik.
3. Czy `RUNTIME_CONTRACTS_CURRENT.md` odnotowuje granice kontraktowe.
4. Czy `ROADMAP_REGISTRY_EXECUTION.md` ma poprawny status etapu.
5. Czy `DOCS_CATALOG.md` nadal opisuje realny układ dokumentów.
6. Czy nie powstał nowy duplikat informacji bez wyraźnego źródła głównego.

## Wniosek operacyjny

Od teraz brak porządku dokumentacyjnego jest traktowany jak realna wada projektu, a nie tylko problem estetyczny.
