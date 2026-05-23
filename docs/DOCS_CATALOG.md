# Documentation Catalog

Data: 2026-05-14
Status: canonical_current
Cel: pełna klasyfikacja dokumentacji `docs/` po roli, autorytecie i sposobie czytania

## Klasy statusu dokumentów

- `canonical_current`
- `current_reference`
- `current_plan`
- `incident_reference`
- `historical_reference`
- `staging_reference`
- `contradicted_in_part`

## Canonical set

To jest nadrzędny zestaw dokumentów:

| Plik | Rola |
|---|---|
| `README.md` | krótki entry point |
| `DOCUMENTATION_GOVERNANCE_SPEC.md` | reguły prowadzenia dokumentacji |
| `CURRENT_STATE.md` | potwierdzony stan bieżący |
| `RUNTIME_CONTRACTS_CURRENT.md` | aktywne kontrakty i granice |
| `ROADMAP_REGISTRY_EXECUTION.md` | bieżący plan i status etapów |
| `MCP_OPERATOR_MANUAL.md` | workflow operatorski |
| `DOCS_CATALOG.md` | klasyfikacja całego katalogu |

## Katalog

| Plik | Rola | Status | Jak czytać |
|---|---|---|---|
| `README.md` | entry point | `canonical_current` | zacznij od tego |
| `DOCUMENTATION_GOVERNANCE_SPEC.md` | nadrzędna specyfikacja dokumentacji | `canonical_current` | ustala hierarchię źródeł prawdy |
| `CURRENT_STATE.md` | bieżący stan runtime i checkpointów | `canonical_current` | czytać jako stan, nie plan |
| `RUNTIME_CONTRACTS_CURRENT.md` | aktywny tool surface, granice, kontrakty | `canonical_current` | czytać jako kontrakty, nie historię |
| `ROADMAP_REGISTRY_EXECUTION.md` | plan wykonawczy i statusy etapów | `canonical_current` | czytać jako plan, nie wdrożenie |
| `MCP_OPERATOR_MANUAL.md` | workflow operatorski | `canonical_current` | procedury pracy z runtime |
| `DOCS_CATALOG.md` | klasyfikacja docs | `canonical_current` | mapa całego katalogu |
| `reference/REGISTRY.md` | aktualny stan registry | `current_reference` | wąska referencja tematyczna |
| `reference/KNOWN_ISSUES_CONNECTOR_LAYER.md` | znany problem warstwy connector/safety | `current_reference` | czytać przy diagnostyce klienta |
| `reference/PYTHON_RUNTIME_REQUIREMENTS.md` | wymagania science tools | `current_reference` | czytać przy pracy z Python helpers |
| `reference/ARCHITECTURE_DECISIONS.md` | baseline decyzji architektonicznych | `current_reference` | krótka baza zasad repo/runtime |
| `reference/ARCHITECTURE_OUTPUTSCHEMA_PIPELINE.md` | rollout outputSchema | `current_reference` | reguły rolloutów schem |
| `reference/CORE_MODULE_BOUNDARY_REFACTOR_PLAN.md` | plan i status refaktoru granic modułów `core/` | `current_reference` | kolejność i granice refaktoru |
| `reference/CORE_PACKAGE_ROLE_INDEX.md` | jawny indeks ról plików `core/` (facade/module/legacy) | `current_reference` | mapowanie nazw do odpowiedzialności |
| `reference/MCP_TOOL_CANON_STRICT_VS_STC_SAFE_PROFILE.md` | kanon rozróżnienia strict tool contract vs STC-SAFE profile | `current_reference` | używać jako definicji strictness i granicy profilu |
| `reference/RUNTIME_STATUS_MODULE_SPEC.md` | specyfikacja modułu status/ping runtime | `current_reference` | kontrakt i plan wdrożenia statusu serwera |
| `OPERATIONS_DEPLOY.md` | krótka checklista deploy | `current_reference` | pomocniczo obok operator manual |
| `reference/REMOTE_SITE_TOOLS_PLAN.md` | plan i ograniczenia remote site tools | `current_reference` | tylko dla tej rodziny narzędzi |
| `reference/LLM_EXECUTION_BRIEF.md` | briefing dla kolejnego modelu | `current_reference` | operacyjne zasady pracy modelu |
| `reference/LLM_IDIOT_PROOF_PROTOCOL_2026-05-04.md` | prostszy protokół pracy | `current_reference` | używać jako checklista modelowa |
| `reference/MCP_DOCS_NORMALIZATION_AND_EDITORIAL_REDACTION_STRATEGY.md` | wykonawcza strategia porządkowania docs | `current_reference` | jak normalizować katalog bez utraty pamięci |
| `incidents/INCIDENT_2026-05-03_REGISTRY_EXECUTE_V1_PLAN_READY.md` | incydent plan_ready mismatch | `incident_reference` | trwała lekcja wykonawcza |
| `incidents/INCIDENT_2026-05-03_REGISTRY_OUTPUTSCHEMA_ROLLBACK.md` | incydent rollback/outputSchema | `incident_reference` | trwała lekcja rolloutowa |
| `archive/AUDIT_2026-05-03.md` | pełny audyt punktowy | `historical_reference` | historia stanu na 2026-05-03 |
| `archive/AUDIT_2026-05-03_DEEP.md` | rozszerzony audyt | `historical_reference` | cenne findings, ale historyczne |
| `archive/OPENAI_MCP_CONFORMANCE_2026-05-03.md` | audyt zgodności OpenAI/MCP | `historical_reference` | nadal cenny, ale datowany |
| `archive/LLM_FULL_HANDOFF_2026-05-04.md` | pełny historyczny handoff | `historical_reference` | szeroki zrzut kontekstu z jednego etapu |
| `archive/LLM_SESSION_TIMELINE_2026-05-04.md` | timeline sesji | `historical_reference` | historia, nie źródło bieżącej prawdy |
| `archive/MCP_STEP_LOG.md` | dziennik kroków | `historical_reference` | ścieżka czasu, nie specyfikacja |
| `archive/MCP_INTEGRATION_ISSUES.md` | zbiór reguł i incydentów integracyjnych | `contradicted_in_part` | czytać tylko z canonical docs obok |
| `archive/MCP_TOOL_CONTRACTS.md` | dawny szeroki dokument kontraktów | `contradicted_in_part` | historycznie cenny, ale nie current truth |
| `archive/REGISTRY_RUNTIME_DESIGN.md` | design registry z dawnymi milestone’ami | `contradicted_in_part` | miesza design i wdrożenie |
| `archive/MCP_OPENAI_ROADMAP.md` | dawny skrót zgodności/integracji | `contradicted_in_part` | nie opisuje już samodzielnie bieżącego runtime |
| `archive/MCP_INDEX.md` | dawny skrócony index | `historical_reference` | zachowany tylko jako ślad wcześniejszego entry pointu |
| `research/mcp_apps_sdk_audit.md` | wczesny audyt Apps/MCP | `historical_reference` | materiał historyczny |
| `research/openai_apps_mcp_extract.md` | extract research | `historical_reference` | materiał źródłowy |
| `research/openai_apps_mcp_research_v2.md` | research v2 | `historical_reference` | materiał źródłowy |
| `archive/MCP_OPENAI_NEXT_START.md` | stary next-session note | `historical_reference` | snapshot etapu |
| `archive/REMOTE_SITE_OPS_LOGGER_STAGE.md` | etapowy notes loggera remote-site | `staging_reference` | etap roboczy, nie current truth |
| `archive/REMOTE_SITE_HARDENING_COMPLETION_STAGE.md` | etapowy notes hardeningu | `staging_reference` | etap roboczy, nie current truth |
| `archive/REMOTE_SITE_PERMISSION_HARDENING_NOTES.md` | notes permission hardening | `staging_reference` | wąski notes problemowy |
| `archive/REMOTE_SITE_TOOLS_DEPLOY_NOTES.md` | notes deploy dependency | `staging_reference` | pomocniczy notes wdrożeniowy |
| `archive/*` | stare plany, TODO, frameworki, notatki | `historical_reference` | historia projektu |
| `archive/mcp_tools_status.md` | dawny snapshot runtime | `historical_reference` | stan historyczny |

## Najważniejsze problemy, które były

Najbardziej mylące pliki:

- `archive/MCP_TOOL_CONTRACTS.md`
- `archive/REGISTRY_RUNTIME_DESIGN.md`
- `archive/MCP_OPENAI_ROADMAP.md`
- część plików `REMOTE_SITE_*`

Powód:

- mówią o prawdziwych rzeczach, ale nie jako bieżące source-of-truth,
- mieszają plan, wdrożenie, historię i incydent,
- łatwo je pomylić z dokumentami canonical.

## Reguła użycia katalogu od teraz

1. Najpierw czytaj canonical set.
2. Dopiero potem sięgaj po `current_reference`.
3. `current_plan` czytaj wyłącznie jako plan.
4. `incident_reference` czytaj jako lekcję, nie specyfikację.
5. `historical_reference` i `staging_reference` nie są podstawą do decyzji bez porównania z runtime i canonical docs.
6. Jeśli nagłówek statusu w pliku koliduje z tym katalogiem, traktuj `DOCS_CATALOG.md` oraz canonical docs jako rozstrzygające i zsynchronizuj nagłówek przy najbliższym bezpiecznym slicesie.


