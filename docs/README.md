# Dokumentacja `C:\Work\mcp`

Data porządkowania: 2026-05-14
Status: canonical_current
Zakres: krótki entry point do całej dokumentacji projektu

## Cel

Ten plik nie ma już próbować streszczać całego projektu. Ma tylko odpowiedzieć na trzy pytania:

- od czego zacząć czytanie,
- które pliki są source-of-truth,
- gdzie szukać reszty.

## Czytaj w tej kolejności

1. `docs/README.md`
2. `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`
3. `docs/CURRENT_STATE.md`
4. `docs/RUNTIME_CONTRACTS_CURRENT.md`
5. `docs/ROADMAP_REGISTRY_EXECUTION.md`
6. `docs/MCP_OPERATOR_MANUAL.md`
7. `docs/DOCS_CATALOG.md`

Potem tematycznie:

- `docs/reference/REGISTRY.md`
- `docs/reference/PYTHON_RUNTIME_REQUIREMENTS.md`
- `docs/reference/KNOWN_ISSUES_CONNECTOR_LAYER.md`
- `docs/reference/LLM_EXECUTION_BRIEF.md`
- `docs/reference/MCP_DOCS_NORMALIZATION_AND_EDITORIAL_REDACTION_STRATEGY.md`

## Canonical set

To jest zestaw nadrzędny:

- `DOCUMENTATION_GOVERNANCE_SPEC.md`
- `CURRENT_STATE.md`
- `RUNTIME_CONTRACTS_CURRENT.md`
- `ROADMAP_REGISTRY_EXECUTION.md`
- `MCP_OPERATOR_MANUAL.md`
- `DOCS_CATALOG.md`

Jeśli starszy plik mówi coś innego niż ten zestaw, pierwszeństwo ma:

1. runtime i testy
2. canonical set
3. reszta dokumentacji

## Role dokumentów

- `CURRENT_STATE.md`
  - tylko bieżący stan i potwierdzone checkpoints
- `RUNTIME_CONTRACTS_CURRENT.md`
  - aktywny tool surface, granice i kontrakty
- `ROADMAP_REGISTRY_EXECUTION.md`
  - plan i status etapów
- `MCP_OPERATOR_MANUAL.md`
  - workflow operatorski
- `DOCS_CATALOG.md`
  - klasyfikacja całego `docs/`

Pełne reguły są w:

- `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`

## Czego nie robić

- nie czytać jednego starego pliku jako całej prawdy o systemie,
- nie traktować roadmapy jak wdrożenia,
- nie traktować incydentu jak aktualnej specyfikacji,
- nie zakładać, że istnienie pliku oznacza aktywny runtime.

## Gdzie szukać historii

Historia i starsze notatki nadal są zachowane, ale nie są punktem startowym:

- `docs/archive/`
- `docs/archive/MCP_STEP_LOG.md`
- starsze audyty, handoffy i research notes

Klasyfikację każdego pliku znajdziesz w:

- `docs/DOCS_CATALOG.md`
