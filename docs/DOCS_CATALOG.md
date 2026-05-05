# Documentation Catalog

Data: 2026-05-04
Status: canonical_current
Cel: sklasyfikować wszystkie dokumenty w `docs/` według roli, czasu, świeżości i autorytetu

## Klasy statusu dokumentów

- `canonical_current`
- `current_reference`
- `current_plan`
- `historical_reference`
- `staging_or_local_only_reference`
- `contradicted_in_part`

## Katalog

| Plik | Rola | Zakres czasu | Status | Jak czytać |
|---|---|---|---|---|
| `README.md` | indeks canonical | 2026-05-04 | `canonical_current` | zaczynać od tego |
| `CURRENT_STATE.md` | bieżący stan systemu | 2026-05-05 | `canonical_current` | opis aktualnego runtime po web_tools, registry execute oraz truth tools pierwszego rzutu |
| `AUDIT_2026-05-03_DEEP.md` | rozszerzony audyt findings + zalecenia | 2026-05-03 | `canonical_current` | główny dokument dla ryzyk, nieprawidłowości i zaleceń |
| `OPENAI_MCP_CONFORMANCE_2026-05-03.md` | matryca zgodności MCP / Apps | 2026-05-03 | `canonical_current` | zgodność z wyciągami OpenAI na podstawie kodu |
| `RUNTIME_CONTRACTS_CURRENT.md` | aktualne granice kontraktowe runtime | 2026-05-05 | `canonical_current` | czytać zamiast traktować `MCP_TOOL_CONTRACTS.md` jako source-of-truth |
| `LLM_IDIOT_PROOF_PROTOCOL_2026-05-04.md` | idiotoodporny protokół pracy dla kolejnego LLM | 2026-05-04 | `canonical_current` | najprostsza instrukcja wykonywania pracy krok po kroku |
| `LLM_EXECUTION_BRIEF.md` | briefing wykonawczy dla kolejnego LLM | 2026-05-03 | `canonical_current` | zasady pracy, harmonogram i dyscyplina dokumentacyjna |
| `LLM_FULL_HANDOFF_2026-05-04.md` | pełny handoff dla kolejnego LLM | 2026-05-04 | `canonical_current` | pełny kontekst, ustalenia i workflow |
| `LLM_SESSION_TIMELINE_2026-05-04.md` | chronologia serii audytów | 2026-05-04 | `canonical_current` | skrócona ścieżka czasu wykonanych prac |
| `AUDIT_2026-05-03.md` | pełny audyt | 2026-05-03 | `canonical_current` | główny wynik audytu |
| `DOCS_CATALOG.md` | mapa i świeżość docs | 2026-05-03 | `canonical_current` | klasyfikacja wszystkich dokumentów |
| `ARCHITECTURE_DECISIONS.md` | decyzje baseline repo/runtime | 2026-05-01 | `current_reference` | ważny dokument bazowy |
| `MCP_OPERATOR_MANUAL.md` | control-plane operator manual | 2026-05-02/04 | `current_reference` | procedury operacyjne z rozróżnieniem runtime deploy vs repo-only changes |
| `PYTHON_RUNTIME_REQUIREMENTS.md` | wymagania Python dla science tools | 2026-05-03 | `current_reference` | czytać przy pracy z `science_tools` |
| `REGISTRY.md` | aktualny stan registry, outputSchema coverage i ręcznie potwierdzona live verification control-plane | 2026-05-05 | `current_reference` | czytać przy zmianach registry tools |
| `ARCHITECTURE_OUTPUTSCHEMA_PIPELINE.md` | pipeline bezpiecznego rollout outputSchema | 2026-05-03 | `current_reference` | czytać przed zmianami outputSchema |
| `OPERATIONS_DEPLOY.md` | checklist deploy i runtime verification | 2026-05-03 | `current_reference` | czytać przed deploy/rollback |
| `ROADMAP_REGISTRY_EXECUTION.md` | roadmap registry, web_tools, dispatch i execution; zawiera aktualizację V7.1/V7.2, kolejkę prac i rejestr ryzyk architektonicznych | 2026-05-03/04/05 | `current_plan` | czytać przed zmianą kierunku architektury lub pracą nad execution |
| `INCIDENT_2026-05-03_REGISTRY_EXECUTE_V1_PLAN_READY.md` | incydent V7 execute: plan_ready mismatch, rollback ID, wnioski | 2026-05-03 | `current_reference` | czytać przed zmianami execution-adjacent |
| `MCP_TOOL_CONTRACTS.md` | dawny szeroki dokument kontraktów i workflow | 2026-05-01 | `contradicted_in_part` | cenny historycznie, ale częściowo opisuje stary `_mcp_next` workflow |
| `MCP_INTEGRATION_ISSUES.md` | reguły i incydenty integracyjne | 2026-05-01 do 2026-05-03 | `current_reference` | ważne, ale częściowo incydentowe; czytać z bannerem i razem z canonical docs |
| `REGISTRY_RUNTIME_DESIGN.md` | design + wdrożone milestone registry | 2026-05-02 do 2026-05-03 | `current_reference` | ważne dla registry, ale design i wdrożenie są zmieszane; nie traktować `tool_dispatch_readonly` jako active runtime path |
| `status/mcp_tools_status.md` | krótki snapshot wcześniejszego runtime | 2026-05-01 | `contradicted_in_part` | historycznie użyteczny, ale nie opisuje bieżącego tool surface |
| `MCP_INDEX.md` | dawny skrócony entry point | 2026-04-30 | `contradicted_in_part` | nie używać jako current runtime truth |
| `MCP_STEP_LOG.md` | dziennik kroków i zmian | 2026-04-27 -> 2026-05-01+ | `historical_reference` | ścieżka czasu, nie canonical runtime truth |
| `MCP_OPENAI_ROADMAP.md` | compatibility summary | 2026-04-30 | `contradicted_in_part` | zawiera prawdy, ale też zbyt mocne twierdzenia |
| `MCP_OPENAI_NEXT_START.md` | next-session operational note | 2026-04-28 | `historical_reference` | snapshot jednego etapu prac |
| `mcp_apps_sdk_audit.md` | wczesny audyt Apps/MCP | 2026-04-27 | `contradicted_in_part` | część obserwacji zestarzała się względem kodu |
| `openai_apps_mcp_extract.md` | research extract | 2026-04-27 | `historical_reference` | materiał źródłowy do audytu |
| `openai_apps_mcp_research_v2.md` | research v2 | 2026-04-27 | `historical_reference` | materiał źródłowy do audytu |
| `archive/MCP_DEV_NOTES.md` | dawne notatki operacyjne | 2026-04-25 | `historical_reference` | historia projektu |
| `archive/MCP_NEXT_STEPS.md` | dawna roadmapa funkcjonalna | 2026-04-26 | `historical_reference` | plan, nie stan |
| `archive/MCP_TODO.md` | dawne TODO | 2026-04-25 | `historical_reference` | plan, nie baseline |
| `archive/MODULARIZATION_PLAN.md` | plan modularizacji | 2026-04-25 | `historical_reference` | opis przejścia do modularnego runtime |
| `archive/MODULARIZATION_STATUS.md` | status modularizacji | 2026-04-25/26 | `historical_reference` | ważny dla historii architektury |
| `archive/OPENAI_APPS_MCP_FRAMEWORK.md` | framework lokalnych zasad Apps/MCP | 2026-04-26 | `historical_reference` | dobre tło integracyjne |
| `archive/REFACTOR_V1_NOTES.md` | notatki refactor v1 | 2026-04-25 | `historical_reference` | czysta historia |
| `archive/INSPIRATIONAL_CHAT_WORKFLOW.md` | workflow specyficzny dla jednego pliku | 2026-04-26 | `historical_reference` | wąski use-case, nie opis projektu |
| `archive/_mcp_fs_ops_test_moved.txt` | artefakt testowy | 2026-04-25 | `historical_reference` | nie traktować jako dokumentacji systemu |

## Najważniejsze obserwacje

### 1. Dokumenty mieszające różne warstwy

Najbardziej problematyczne były:

- `MCP_INDEX.md`
- `MCP_OPENAI_ROADMAP.md`
- `REGISTRY_RUNTIME_DESIGN.md`
- `MCP_INTEGRATION_ISSUES.md`
- `MCP_TOOL_CONTRACTS.md`

Powód:

- mieszają runtime truth, design, incident notes, operator rules i roadmapę.

### 2. Dokumenty, które zestarzały się częściowo, ale nadal są cenne

- `mcp_apps_sdk_audit.md`
- `MCP_OPENAI_ROADMAP.md`

Czytać je jako historię decyzji i wcześniejszych diagnoz, a nie jako bieżący opis systemu.

### 3. Dokumenty, które zachowują ścieżkę czasu

Jeżeli celem jest rekonstrukcja historii projektu, główna ścieżka czasu jest tutaj:

1. `archive/MODULARIZATION_PLAN.md`
2. `archive/MODULARIZATION_STATUS.md`
3. `archive/REFACTOR_V1_NOTES.md`
4. `MCP_STEP_LOG.md`
5. `MCP_INTEGRATION_ISSUES.md`
6. `REGISTRY_RUNTIME_DESIGN.md`
7. `AUDIT_2026-05-03.md`
8. `AUDIT_2026-05-03_DEEP.md`
9. `LLM_SESSION_TIMELINE_2026-05-04.md`
10. `CURRENT_STATE.md`

## Reguła utrzymania od teraz

Nowy dokument można dodać do `docs/` tylko wtedy, gdy od razu wiadomo:

- czy opisuje stan bieżący,
- czy opisuje historię,
- czy opisuje plan,
- czy opisuje tylko staging/local artifacts.

Jeśli nie da się tego powiedzieć jednym zdaniem, dokument jest źle nazwany albo źle umieszczony.
