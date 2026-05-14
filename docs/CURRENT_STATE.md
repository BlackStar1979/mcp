# Current State

Data: 2026-05-14
Status: canonical_current
Zakres: potwierdzony stan bieżący projektu `C:\Work\mcp`

## Rola tego dokumentu

Ten plik opisuje tylko:

- co jest dziś aktywne,
- co zostało potwierdzone,
- jakie checkpointy są zamknięte,
- jakie otwarte nieprawidłowości nadal istnieją.

Ten plik nie jest:

- główną roadmapą,
- pełnym podręcznikiem operatorskim,
- jedynym opisem kontraktów,
- pełną historią projektu.

Do tych ról służą odpowiednio:

- `docs/ROADMAP_REGISTRY_EXECUTION.md`
- `docs/MCP_OPERATOR_MANUAL.md`
- `docs/RUNTIME_CONTRACTS_CURRENT.md`
- `docs/DOCS_CATALOG.md`
- `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`

## 1. Stan repo i lokalnego runtime

Projekt jest lokalnym MCP runtime z kontrolowanym deploy/rollback.

Potwierdzone:

- repo lokalne: `C:\Work\mcp`
- branch: `main`
- upstream: `origin/main`
- runtime jest rozwijany lokalnie, a GitHub jest pomocniczym źródłem historii, nie zamiennikiem local truth

Najważniejsza zasada:

- source-of-truth dla bieżącego stanu technicznego pozostaje lokalny worktree i aktywny runtime path

## 2. Aktywny runtime
## 2A. Status runtime jako przyszły etap

Potwierdzone architektonicznie, ale jeszcze niewdrożone:

- przy kilku równolegle uruchomionych serwerach MCP potrzebny jest bounded mechanizm statusu runtime,
- ma on służyć jednocześnie do maintenance i do wyboru właściwego serwera przed użyciem,
- ma raportować moduły/profil/stan runtime, a nie tylko listę tooli,
- nie może ujawniać sekretów ani wrażliwych szczegółów hosta.

Planowany model:

- lekki HTTP status endpoint dla monitoringu,
- plus ewentualny read-only MCP status tool,
- oba zasilane z jednego wspólnego runtime-status provider.

To jest zapisane jako przyszły etap po wdrożeniu startup-time module gating dla server_tools.js.

### `server.js`

Potwierdzone:

- read-only MCP
- port `3000`
- read-only profile i tools profile używają wspólnego modelu workspace rootów: bare paths wskazują primary root `C:\Work`, a dodatkowe rooty mogą być dołączane przez `MCP_EXTRA_ROOTS` i adresowane jako `@alias/...`
- w środowiskach nie-Windows domyślne rooty są wyprowadzane z checkoutu repo lub jawnych override `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`, żeby CI i testy nie traktowały `C:\Work` jako ścieżki względnej

### `server_tools.js`

Potwierdzone:

- tools profile
- launcher `server_tools.js --auth access` -> port `3001`
- auth mode `access`: Cloudflare Access assertion model dla publicznego/Codexowego toru
- launcher `server_tools.js --auth bearer --token-file <BASE MCP>\.secrets\mcp_token.txt` -> port `3002`
- launcher `server_tools.js --auth oauth2` -> port `3003` (reserved, jeszcze niezaimplementowany)
- legacy shim `server_tools_token.js` nadal istnieje, ale nie jest docelowym launcherem
- `StreamableHTTPServerTransport`
- startup recovery
- runtime timing/perf hooks
- startup-time module gating jest wdrożony:
  - `--modules <csv>`
  - `--disable-modules <csv>`
  - `MCP_ENABLED_MODULES`
  - `MCP_DISABLED_MODULES`
- startup log pokazuje posture modułów:
  - `enabled_ids`
  - `disabled_ids`
  - `enabled_labels`
- pełny `server_tools.js` ma centralny perf wrapper:
  - każde `server.registerTool(...)` jest mierzone przez `timeTool(...)`
  - każdy `POST /mcp` request jest mierzony przez `timeRequest(...)`

Rejestrowane aktywne grupy tooli:

- index tools
- filesystem tools
- science tools
- connector-safe code tools
- connector-safe registry tools
- web tools
- truth tools
- process tools
- remote site tools

### `stc_safe.js`

Potwierdzone lokalnie w repo i publicznie:

- connector-safe profile
- osobny entrypoint `stc_safe.js`
- domyślny port `3010`
- strict shape version `2025-05-strict-v1`
- wystawia tylko:
  - `search`
  - `fetch`
- używa zwykłego JSON-RPC over HTTP na `POST /mcp`, a nie `StreamableHTTPServerTransport`
- nie importuje modułów mutation-capable z `server_tools.js`
- lokalny self-test przechodzi:
  - `node C:\Work\mcp\stc_safe.js --self-test`
- publiczny rollout działa pod:
  - `https://mcp-stc-safe.romionologic.dev/mcp`
- ChatGPT Desktop connector potwierdził poprawny handshake i widoczność:
  - `search`
  - `fetch`
- connector-safe runtime ma już jawne observability hooks:
  - `rpc_received`
  - `tool_call_start`
  - `tool_call_end`
  - `tool_call_error`
  - `server_error`
  - `server_start`
  - oraz zdarzenia pomocnicze:
    - `stc_safe_search`
    - `stc_safe_fetch`
    - `stc_safe_request`
  - a do `.mcp_perf.log`:
    - `timeTool(...)`
    - `timeRequest(...)`

## 2.1 Struktura `core/` — stan po audycie

Potwierdzone:

- `server_tools.js` jest modularny na poziomie bootstrapu/rejestracji,
- ale `core/` nie jest jeszcze w pełni semantycznie czyste.

Najważniejsze klasy:

- `true module`:
  - mała, pojedyncza odpowiedzialność
- `package facade`:
  - świadomie szeroki entrypoint dla rodziny narzędzi
- `legacy container` / `mixed responsibility`:
  - plik wyglądający jak moduł, ale faktycznie będący kontenerem wielu różnych ról

Najbardziej problematyczne po audycie:

- `core/truth_tools.js`
- `core/remote_site_tools.js`
- `core/code_tools_safe.js`
- `core/code_tools.js` jako legacy container

Zamknięte po audycie:

- `core/tools_fs.js` został zredukowany do cienkiej fasady
- odpowiedzialności filesystem są rozdzielone do:
  - `core/filesystem/read_tools.js`
  - `core/filesystem/mutation_tools.js`
  - `core/filesystem/patch_tools.js`
- `core/web_tools.js` został zredukowany do cienkiej fasady
- odpowiedzialności web są rozdzielone do:
  - `core/web/http_tools.js`
  - `core/web/package_tools.js`
  - `core/web/github_tools.js`
  - współdzielone runtime/schema helpery:
    - `core/web/runtime.js`
- `core/truth_tools.js` został zredukowany do cienkiej fasady
- odpowiedzialności truth są rozdzielone do:
  - `core/truth/audit_tools.js`
  - `core/truth/workflow_tools.js`
  - `core/truth/usage_tools.js`
  - współdzielone runtime/schema helpery:
    - `core/truth/shared.js`
- `core/remote_site_tools.js` został zredukowany do cienkiej fasady
- odpowiedzialności remote_site są rozdzielone do:
  - `core/remote_site/file_ops_tools.js`
  - `core/remote_site/runtime_tools.js`
  - współdzielone runtime/schema/path helpery:
    - `core/remote_site/shared_runtime.js`

Kierunek przyjęty:

- najpierw startup-time module gating,
- dopiero potem etapowe rozcięcie największych kontenerów.

Szczegóły i kolejność:

- `docs/reference/CORE_MODULE_BOUNDARY_REFACTOR_PLAN.md`

Potwierdzone założenia kontraktu connector-safe po lekturze `C:\Work\mcp-tests\MCP_CONNECTOR_FINDINGS_DUMP_2026-05-12_v2.md`:

- `stc_safe.js` ma naśladować `C:\Work\mcp-tests\server.js`, a nie pełny `server_tools.js`
- `search` i `fetch` mają używać:
  - `outputSchema`
  - `structuredContent`
  - JSON mirror w `content[0].text`
- `fetch` ma twardy cap:
  - `2500` znaków
- `fetch.metadata` ma zawierać:
  - `source`
  - `kind`
  - `connectorShapeVersion`
  - `truncated`
  - `original_chars`
  - `cap_chars`
- audit connector-safe nie loguje surowych:
  - `query`
  - `id`
  tylko:
  - `arg_sha256`
  - długości
  - klasyfikujące flagi markerów
- canary docs diagnostyczne są wspierane, ale nie powinny być eksponowane w normalnym search bez jawnego trybu diagnostycznego
- `stc_safe.js` nie jest miejscem na:
  - bearer/OAuth redesign
  - Cloudflare changes
  - mutation tools
  - approval-bridge debugging przez narzędzia wykonawcze

Potwierdzone praktycznie po surowych wywołaniach `POST /mcp` na `3010`:

- `tools/list` zwraca tylko:
  - `search`
  - `fetch`
- `search("Cloudflare Access")` zwraca:
  - niepuste `structuredContent.results[]`
  - poprawny JSON mirror w `content[0].text`
  - publiczne URL-e oparte o `https://mcp-stc-safe.romionologic.dev/...`
- `fetch("docs/runtime_contracts_current")` zwraca:
  - niepuste `structuredContent`
  - poprawny JSON mirror w `content[0].text`
  - expected truncation metadata:
    - `truncated: true`
    - `original_chars: 16146`
    - `cap_chars: 2500`

Wniosek praktyczny:

- po stronie samego `stc_safe.js` nie udało się odtworzyć server-side "pustej odpowiedzi"
- jeśli ChatGPT Desktop nadal pokazuje pusty wynik w części scenariuszy, silniejszą hipotezą pozostaje warstwa klienta niż pusty payload z connector-safe runtime

Granica potwierdzenia i rola:

- `stc_safe.js` nie zastępuje `server.js`
- `server.js` pozostaje lokalnym read-only MCP dla workspace
- `stc_safe.js` jest osobnym publicznym profilem connector-safe dla ChatGPT Desktop
- strict `2025-05-strict-v1` oznacza dziś wyłącznie:
  - `search`
  - `fetch`
- nie jest potwierdzone, że ChatGPT Desktop wymaga dokładnie dwóch tooli jako takiego wymogu protokołu; potwierdzone jest tylko to, że minimalny profil z poprawnym shape działa stabilnie
- niektóre wrażliwie wyglądające argumenty mogą być zatrzymywane przez ChatGPT Desktop approval/preflight zanim dotrą do MCP; taki request nie jest server-solvable i nie pojawi się w audit logu serwera

Potwierdzone aktywne narzędzia warstwy truth tools:

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`
- `change_workflow_simulator`
- `tool_usage_snapshot`

Potwierdzone aktywne narzędzia warstwy process tools:

- `run_process`
- `process_runner_status`

Model bezpieczeństwa tej warstwy:

- allowlisted bare executables
- `shell: false`
- bounded `cwd` przez workspace policy
- bounded stdout/stderr
- timeout
- audyt `process_start` / `process_finish`
- brak dziedziczenia pełnego `process.env` do child process
- PowerShell domyślnie tylko przez `-File` do workspace-local `.ps1`

Potwierdzone aktywne narzędzia warstwy remote site tools:

- `list_remote_site_files`
- `read_remote_site_file`
- `write_remote_site_file`
- `edit_remote_site_file`
- `move_remote_site_file`
- `delete_remote_site_file`
- `restore_remote_site_file`
- `remote_site_runtime_status`
- `preview_remote_site_retention`

Aktualna praktyka operacyjna dla auth do VPS:

- narzędzia `remote_site_*` nie mają jeszcze ustalonej architektury domyślnej lokalizacji configu
- live użycie i testy wymagają jawnego `vps_config_ref`
- aktualnie potwierdzony działający ref operatorski to:
  - `www/remote-site-tools-config.json`
- plik `C:\Work\www\remote-site-tools-config.json` jest operacyjnym kluczem wejścia na VPS dla tej rodziny tooli i nie powinien być "odkrywany" przez zgadywanie ścieżki

## 2a. Logging coverage

Potwierdzone po przeglądzie aktywnego runtime i touched modules:

- `.mcp_perf.log`
  - pełny `server_tools.js` loguje requesty i wszystkie zarejestrowane toole centralnie
  - `stc_safe.js` loguje requesty MCP oraz wywołania:
    - `search`
    - `fetch`
- `.mcp_audit.log`
  - `filesystem`, `web`, `truth`, `process`, `registry`, `remote_site` miały już explicit audit
  - domknięto brakujące audit coverage dla:
    - `tools_index.js`
    - `science_tools.js`
    - `code_tools_safe.js`
    - auth deny paths w:
      - `auth.js`
      - `auth_bearer.js`
    - connector-safe runtime `stc_safe_runtime.js`

Wniosek procesowy po review z 2026-05-12:

- brak observability nie może być wykrywany dopiero ręcznie po feature work
- nowy runtime/tool path ma być traktowany jako niegotowy, jeśli nie ma:
  - perf trace
  - audit trace
  - testu coverage
- szczególnie ważne jest to dla osobnych runtime, takich jak `stc_safe.js`, które nie dziedziczą automatycznie wrapperów z `server_tools.js`

Ważna granica:

- helpery wewnętrzne `remote_site_*` nie muszą każdy z osobna pisać do obu logów, jeśli observability jest domknięte na poziomie narzędzia/runtime
- source-of-truth dla coverage loggerów pozostaje:
  - aktywny runtime path
  - test `tests/logging_coverage.test.js`

## 3. Auth i tunel

### Potwierdzone

- `server_tools.js --auth access` obsługuje tor Codex/Cloudflare Access na `3001`
- publiczny host `https://modular-mcp.romionologic.dev/mcp` jest chroniony przez Cloudflare Access `SERVICE AUTH`
- request przepuszczony przez Cloudflare Access dociera do origin z `Cf-Access-Jwt-Assertion`; aktywny runtime `access` traktuje ten header jako warunek autoryzacji
- `server_tools.js --auth bearer --token-file C:\Work\mcp\.secrets\mcp_token.txt` obsługuje tor bearer na `3002`
- tryb bearer akceptuje `Authorization: Bearer ...` oraz legacy `?token=...` jako fallback kompatybilnościowy dla klienta, który nie potrafi wysłać bearer headera podczas handshake
- `server_tools.js --auth oauth2` jest zarezerwowany dla `3003`, ale nie jest jeszcze zaimplementowany
- `CF-Access-Client-Id` i `CF-Access-Client-Secret` są używane po stronie klienta MCP/Codexa do wejścia przez Access, a nie jako jawny token URL
- publiczny `POST https://modular-mcp.romionologic.dev/mcp` z nagłówkami Access i poprawnym `Accept: application/json, text/event-stream` zwraca `200` oraz poprawny MCP `initialize` dla `modular-tools v1.7.0`
- publiczny connector-safe host `https://mcp-stc-safe.romionologic.dev/mcp` działa bez auth i przechodzi:
  - `GET /healthz`
  - `POST /mcp initialize`

### Ważna lekcja praktyczna z publicznego rolloutu

- hostname z underscore:
  - `mcp_stc_safe.romionologic.dev`
  działał przez PowerShell i tunel, ale ChatGPT Desktop nie chciał utworzyć łącznika mimo poprawnych odpowiedzi `/healthz` i `initialize`
- po zmianie hosta na myślniki:
  - `mcp-stc-safe.romionologic.dev`
  handshake w ChatGPT Desktop przeszedł poprawnie

Wniosek operacyjny:

- dla publicznych MCP hostów przeznaczonych do ChatGPT Desktop należy preferować hostname bez underscore
- brak handshake przy hostach z underscore nie był dowodem błędnego serwera MCP; serwer odpowiadał poprawnie po HTTP

### Nadal niepotwierdzone bezpośrednio z kodu

- wewnętrzne zachowanie cache tool list po stronie klienta
- pełna logika connector-layer filtering poza MCP runtime

## 4. Registry control-plane

### Potwierdzone aktywne registry tools

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_execute`
- `tool_registry_plan`

### Potwierdzone aktywne truth tools

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`
- `change_workflow_simulator`
- `tool_usage_snapshot`

Rola:

- porównanie `runtime truth`, `docs truth`, `test truth` i `deploy truth`
- wykrywanie driftu między aktywnym runtime, canonical docs i kluczowymi testami
- mapowanie entrypointów, aktywnych modułów runtime, protected boundaries, legacy/staging areas i relacji test->runtime
- klasyfikacja zmiany jako `repo_only`, `test_only`, `runtime` albo `runtime_with_client_refresh`
- zwracanie minimalnego bezpiecznego workflow wdrożeniowego i powodów decyzji
- symulowanie operator workflow dla planowanej zmiany bez wykonywania deployu
- podsumowanie rzeczywistego użycia tooli na podstawie lokalnego `\.mcp_perf.log`, żeby decyzje o kolejnych narzędziach opierać o obserwowane wzorce użycia
- narzędzie read-only, local-world, bez dispatch i bez side effects poza audytem

### Faktyczny model registry dziś

Registry jest:

- connector-safe
- no-dispatch
- no real execution
- simulation-only dla `tool_registry_execute`
- plan-driven

To oznacza:

- `tool_registry_execute` istnieje i jest wdrożone,
- ale real execution nadal nie jest wdrożone,
- dispatch nadal nie jest wdrożony,
- side effects przez registry execution nadal nie są dozwolone.

Live MCP verification z 2026-05-05 potwierdziła cały exposed registry control-plane:

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_plan`
- `tool_registry_execute`

### Czego nadal nie wolno nazywać aktywnym execution layer

- `dispatchRegisteredTool(...)` jako aktywny runtime connector path
- write-capable registry execution
- registry mutation
- network-capable registry execution przez registry path

## 5. Web tools

Potwierdzone aktywne toole:

- `http_get`
- `pypi_info`
- `check_pypi_package`
- `check_npm_package`
- `fetch_github_file`

Model bezpieczeństwa:

- read-only
- allowlisted
- bounded
- no auth
- no cookies
- no disk writes
- `openWorldHint: true`

Test coverage:

- `tests/mcp_contract_surface.test.js` obejmuje web tools przez `registerWebTools`
- test kontraktu wymusza obecność aktywnych web tools:
  - `http_get`
  - `pypi_info`
  - `check_pypi_package`
  - `check_npm_package`
  - `fetch_github_file`

Znana uwaga operacyjna:

- connector/safety layer może dawać false positives dla części wywołań mimo poprawnego MCP runtime
- `pypi_info` został dodany jako bardziej neutralny alias dla `check_pypi_package`, żeby zmniejszyć ryzyko heurystycznych blokad bez zrywania kompatybilności wstecznej
- live MCP verification z 2026-05-05 potwierdziła, że `pypi_info`, `check_pypi_package` i `http_get` poprawnie zwracają dane dla `https://pypi.org/pypi/zod/json`; to wzmacnia wniosek, że historyczne blokady były connector-dependent, a nie runtime-dependent
- `check_npm_package` został wdrożony jako bounded lookup po endpointcie `https://registry.npmjs.org/<package>/latest`, a nie po pełnym dokumencie pakietu; live MCP verification z 2026-05-05 potwierdziła `status: ok` dla `is-number` i `zod`
- `fetch_github_file` jest zawężony do `raw.githubusercontent.com` i przyjmuje jawne segmenty `owner/repo/ref/path`; nie pobiera HTML z `github.com`, nie używa auth i nie zapisuje nic na dysk

## 6. Recovery i legacy separation

Potwierdzone:

- startup recovery nie importuje już rollbacku z legacy `core/code_tools.js`
- `server_tools.js` używa:
  - `core/recovery_rollback.js`

Wniosek:

- poprzednia luka „safe runtime zależy startowo od legacy full profile” została zamknięta na poziomie kodu runtime i testów

## 6.5. Workspace scope

Potwierdzone lokalnie w kodzie i repo validation:

- filesystem, index i science path policy są liczone względem primary root `C:\Work`, a dodatkowe rooty są jawnie adresowane przez `@alias/...`
- runtime repo, docs canonical, logi, deploy control-plane i truth tools pozostają zakotwiczone w `C:\Work\mcp` niezależnie od liczby workspace rootów
- ochrona runtime pozostaje aktywna dla `mcp/core`, `mcp/server.js`, `mcp/server_tools.js`, `mcp/package.json` i `mcp/package-lock.json`

Potwierdzone live przez aktywny MCP po restarcie `server_tools.js` dnia 2026-05-06:

- `list_directory(".")` pokazuje primary root `C:\Work`, a nie dawny root `C:\Work\mcp`
- `list_directory("romionsim")` działa poprawnie i zwraca zawartość `C:\Work\romionsim`
- `get_info("mcp")` nadal wskazuje katalog runtime repo jako podkatalog primary workspace

## 6.6. Zamknięte regresje CI (2026-05-06)

Potwierdzone i zamknięte:

- regresja 1: `truth_tools.js` budował ścieżki runtime przez ręczne `\\`, co na runnerze Ubuntu łamało `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard`, `change_workflow_simulator` i `tool_usage_snapshot`
- naprawa 1: przejście na `path.join(...)` i test regresyjny pilnujący platform-safe path joins
- regresja 2: model multi-root zakładał Windowsowe domyślne rooty nawet na non-Windows hostach, więc CI traktowało `C:\Work` jako ścieżkę względną wewnątrz checkoutu
- naprawa 2: host-aware fallback w `core/config.js`; na Windows pozostają `C:\Work` / `C:\Work\mcp`, a na non-Windows rooty są wyprowadzane z checkoutu repo albo z `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`
- regresja 3: `tool_usage_snapshot` wymagał obecności lokalnego `.mcp_perf.log`, co nie jest gwarantowane na GitHub Actions
- naprawa 3: brak `.mcp_perf.log` nie wywraca już narzędzia; zwracany jest pusty snapshot `status: ok` z jawną notą o braku logu

Wniosek operacyjny:

- nowe narzędzia read-only nie mogą zakładać Windows-only path semantics
- testy config/path policy nie mogą hardcode'ować Windowsowych absolutnych ścieżek jako jedynego poprawnego środowiska wykonania
- narzędzia obserwacyjne i pomocnicze nie mogą wymagać lokalnych artefaktów runtime jako warunku przejścia całego CI
- po każdej większej zmianie path modelu albo truth tools trzeba sprawdzić nie tylko `npm test` lokalnie, ale też czy testy nie ukrywają założeń host-specific

## 6.7. Connector-safe profile

Potwierdzone:

- `stc_safe.js` istnieje jako osobny lokalny entrypoint w repo `C:\Work\mcp`
- profil jest addytywny wobec istniejącego runtime; nie zastępuje `server.js` ani `server_tools.js`
- strict contract tests dla `search`, `fetch`, `connectorShapeVersion` i braku mutation tools przechodzą
- pełny suite repo po dodaniu tego profilu przechodzi:
  - `npm test` PASS `170/170`

Cel tego profilu:

- odseparować ChatGPT connector-safe MCP od pełnego tools runtime
- uniknąć approval-triggering i mutation-capable tools w jednym publicznym MCP surface
- trzymać kontrakt odpowiedzi zgodny z canary `C:\Work\mcp-tests\server.js`

## 6.8. Lekcje z ChatGPT Desktop i canary

Potwierdzone:

- historyczna awaria `C:\Work\mcp-tests\server.js` nie wynikała z samego MCP protocol shape, tylko z uszkodzonego pliku zapisanego jako jedna linia, przez co komentarz `//` wykomentował resztę pliku
- po naprawie:
  - `node --check C:\Work\mcp-tests\server.js` przechodził
  - `node C:\Work\mcp-tests\server.js --self-test` przechodził
- `mcp-tests` pozostaje dobrym canary dla connector-safe response shape, ale nie jest docelowym runtime repo

Najważniejszy wniosek diagnostyczny:

- problem Desktopa był bliżej approval/tool-call bridge i zachowania klienta niż samego `search`/`fetch`
- stabilne były scenariusze:
  - `search`
  - `fetch`
- niestabilność korelowała z mutation-capable i approval-triggering workflows

Wniosek architektoniczny:

- nie należy debugować ChatGPT Desktop connectora przez pełny `server_tools.js`
- do tego służy osobny `stc_safe.js`

## 6.9. Lekcje z przeglądu TypeScript SDK

Potwierdzone z przeglądu materiałów `typescript-sdk-main`:

- SDK pokazuje wspierany wzorzec stateless HTTP server dla MCP
- SDK pokazuje wspierany wzorzec `enableJsonResponse: true` dla plain JSON odpowiedzi zamiast SSE
- przykłady istotne dla dalszych prac:
  - `examples/server/src/jsonResponseStreamableHttp.ts`
  - `examples/server/src/simpleStatelessStreamableHttp.ts`
  - `packages/middleware/express/src/auth/bearerAuth.ts`

Wnioski praktyczne:

- obecny `stc_safe.js` jako minimalny plain-JSON connector-safe profil jest zgodny z duchem przykładów SDK
- przy późniejszym etapie `oauth2` warto opierać się na wzorcach middleware z SDK zamiast pisać pełne auth od zera
- nie wolno bezpośrednio kopiować kodu z `typescript-sdk-main` bez sprawdzenia zgodności wersji, bo lokalne repo używa dziś `@modelcontextprotocol/sdk` `1.29.0`

## 6.10. Lekcje z przeglądu Python SDK

Potwierdzone z przeglądu `python-sdk-main.zip`:

- istnieje osobny przykład:
  - `examples/servers/simple-streamablehttp-stateless/...`
  który pokazuje stateless HTTP server jako wspierany wzorzec
- przykład ten ma przełącznik:
  - `json_response`
  czyli plain JSON response mode jest świadomie wspieranym wariantem obok SSE
- przykład auth:
  - `examples/servers/simple-auth/...`
  wyraźnie rozdziela resource server i authorization server zamiast mieszać auth z przypadkowym tool surface
- middleware bearer:
  - `src/mcp/server/auth/middleware/bearer_auth.py`
  potwierdza wzorzec:
    - osobna walidacja bearer tokena
    - `401 invalid_token`
    - `403 insufficient_scope`
    - `WWW-Authenticate`
- testy protected resource metadata:
  - `tests/server/auth/test_protected_resource.py`
  pokazują jawny wzorzec endpointu:
    - `/.well-known/oauth-protected-resource`
    - oraz wariant path-aware, np. dla zasobu `/mcp`
- testy stateless mode:
  - `tests/server/test_stateless_mode.py`
  potwierdzają, że stateless HTTP nie wspiera server-to-client requests takich jak:
    - `list_roots`
    - sampling
    - elicitation

Wnioski praktyczne:

- `stc_safe.js` jako osobny connector-safe profil jest zgodny nie tylko z intuicją, ale też z kierunkiem Python SDK:
  - minimalny surface
  - osobny transport profile
  - brak mieszania auth i mutation w jednym runtime
- plain JSON response mode nie jest obejściem, tylko wspieranym wzorcem do rozważenia przy przyszłej ewolucji connector-safe profilu
- przyszłe `--auth oauth2` w `server_tools.js` powinno być projektowane jako:
  - osobna warstwa auth
  - z protected resource metadata
  - ze scope handling
  - z jawnym rozróżnieniem `401` / `403`
- nie wolno oczekiwać, że stateless connector-safe profil będzie kiedyś dobrym miejscem dla funkcji wymagających server-to-client round-trips

Known issues / ryzyka wynikające z tego przeglądu:

- jeśli kiedyś będziemy chcieli do `stc_safe` dołożyć funkcje zależne od server-to-client requests, to wejdziemy w konflikt z samą naturą stateless connector-safe profilu
- jeśli będziemy implementować `oauth2` bez protected resource metadata, istnieje ryzyko rozminięcia z oczekiwaniami nowocześniejszych klientów i wzorcami SDK

## 6.10a. Future architecture note — local LLM wrapped as MCP tool

Potwierdzone po lekturze `C:\Work\mcp-tests\LOCAL_LLM_WRAPPED_AS_MCP_TOOL_ARCHITECTURE_NOTE.md`:

- to nie jest bieżąca ścieżka rozwoju `stc_safe.js`
- to nie jest bieżąca ścieżka rozwoju publicznego `server_tools.js`
- to jest kandydat na przyszłą architekturę dashboard/VPS

Preferowany wzorzec:

- `agent wrapped as a tool, not agent with tools`

Znaczenie praktyczne:

- lokalny LLM ma być traktowany jako nieufny worker reasoningowy
- wrapper MCP / dashboard backend ma być właściwą granicą bezpieczeństwa
- wrapper ma kontrolować:
  - retrieval
  - permissions
  - context selection
  - prompt construction
  - secret redaction
  - schema validation
  - policy validation
  - audit logging
  - execution gating
- lokalny LLM ma zwracać wyłącznie bounded structured analysis

Zakazy dla tego przyszłego kierunku:

- nie eksponować lokalnego LLM jako autonomicznego agenta
- nie dawać lokalnemu LLM:
  - shell access
  - filesystem access
  - network access
  - MCP tool access
  - direct mutation authority
- nie budować szerokiego:
  - `agent(prompt: string)`
- nie mieszać tej przyszłej rodziny tooli z publicznym connector-safe surface `stc_safe.js`

Wniosek planistyczny:

- jeśli ten kierunek kiedyś ruszy, MVP ma zaczynać od jednego read-only wrapper toola, np.:
  - `local_agent_review`
- a nie od pełnego agentowego runtime

## 6.10b. Operational findings appendix — ChatGPT Desktop / TEST MCP / STC-SAFE

Potwierdzone po lekturze `C:\Work\mcp-tests\MCP_OPERATIONAL_FINDINGS_APPENDIX_FOR_CODEX.md`:

- to jest materiał operacyjny
- dotyczy bieżącego workflow z ChatGPT Desktop, TEST MCP i `stc_safe`
- nie należy go mylić z osobnym future-architecture track dla lokalnego LLM wrappera

Najważniejsze reguły operacyjne:

- mutation-capable MCP tools są obecnie niestabilne przez approval/tool bridge ChatGPT Desktop
- przez Desktop nie należy używać do tego projektu:
  - `write_file`
  - `append_file`
  - `edit_file_patch`
  - `run_process`
  - `copy_path`
  - `move_path`
  - `delete_path`
  - dużych payloadów naprawczych
  - `node -e` repair commands
  - regex one-liner repair commands
- przez Desktop należy ograniczać się do:
  - read-only diagnostics
  - `search` / `fetch`
  - `code_sample_js`
  - read-only file inspection
  - bounded context extraction
  - audit review

Wniosek workflow:

- ChatGPT/Codex przygotowuje patch lub pełny replacement
- człowiek / lokalny edytor / lokalny Codex stosuje zmianę
- PowerShell / lokalny runtime waliduje
- ChatGPT Desktop wykonuje tylko read-only testy

Ważne ograniczenie approval/preflight:

- część wywołań, np. z frazami typu `bearer authorization`, może być zatrzymywana upstream przed dotarciem do serwera MCP
- jeśli request nie dociera do MCP, serwer nie może go:
  - zalogować
  - odrzucić
  - zsanityzować
  - zwrócić kontrolowanego błędu
- takich problemów nie wolno próbować "naprawiać" po stronie `server.js` / `server_tools.js`
- zabronione jest payload smuggling przez kodowanie wrażliwych fraz i dekodowanie ich po stronie serwera

Potwierdzone referencje operacyjne:

- `TEST MCP` pozostaje stabilnym read-only canary z tool surface:
  - `search`
  - `fetch`
  - `code_sample_js`
- `code_sample_js` ma być traktowany jako read-only bounded code sampler
- dla `search` i `fetch` należy utrzymywać exact connector signatures:
  - `search({ query })`
  - `fetch({ id })`
- dla zmian descriptor/tool-surface przy tym samym publicznym URL zwykle wystarcza:
  - restart serwera
  - refresh tools w ChatGPT Desktop
  a nie pełne usuwanie i odtwarzanie connectora

## 6.11. Lekcja z awarii bootstrapu MCP przez nieprawidłowe `inputSchema`

Potwierdzone historycznie na 2026-05-10:

- connector/runtime bootstrap potrafi wyłożyć się już podczas `registerRemoteSiteTools(server)`, zanim dojdzie do pierwszego poprawnego handshake MCP
- rzeczywista awaria miała komunikat:
  - `Error: inputSchema must be a Zod schema or raw shape, received an unrecognized object`

Root cause:

- jedno z rejestrowanych narzędzi użyło finalnie:
  - `inputSchema: CONFIG_REF_INPUT.shape`
- sam `.shape` nie był w tym miejscu poprawnym finalnym `inputSchema` akceptowanym przez SDK runtime

Ważne rozróżnienie:

- użycie `.shape` jako materiału wejściowego do zbudowania końcowego `z.object(...)` lub `extend(...)` jest poprawne
- użycie `.shape` bezpośrednio jako finalnego `inputSchema` w rejestracji toola nie może być uznawane za bezpieczny wzorzec

Dlaczego wcześniejsze testy tego nie złapały:

- descriptor/contract tests przechodziły
- brakowało obowiązkowego testu pełnego runtime bootstrapu z realnym `McpServer`

Aktualna guardraila:

- `tests/server_bootstrap_runtime.test.js`
- test tworzy realny `McpServer`
- wykonuje produkcyjne funkcje rejestrujące, w tym `registerRemoteSiteTools(server)`
- ma failować natychmiast na:
  - nieprawidłowym `inputSchema`
  - błędzie runtime rejestracji

Wniosek procesowy:

- sam pass descriptor tests nie wystarcza przy zmianach powierzchni tooli i schem
- każda zmiana dotykająca rejestracji tooli, `inputSchema`, `outputSchema` albo bootstrap sequence musi być traktowana jako niegotowa bez przejścia testu pełnego runtime bootstrapu

## 6.12. Postęp rolloutu `outputSchema`

Potwierdzone po etapach `7.1`, `7.2`, pełnym `7.3` i `7.4`:

- aktywny surface `server_tools.js` nadal ma `55` tooli
- brakujące `outputSchema` spadły z `30` do `0`

Domknięty slice:

- `index`:
  - `index_status`
  - `build_index`
  - `search_index`
  - `search_index_context`
  - `collect_context`
  - `collect_romionsim_context`
- `science`:
  - `inventory_tree`
  - `fits_info`
  - `hdf5_info`
  - `table_profile`

Guardrail:

- `tests/mcp_contract_surface.test.js` pilnuje teraz, że powyższe narzędzia mają `outputSchema`

Walidacja:

- `npm test` — PASS `181/181`

Domknięty dodatkowy slice:

- `code_tools_safe`:
  - `code_symbols`
  - `code_dependencies`
  - `code_audit`
  - `code_impact`

Domknięty końcowy slice:

- `remote_site`:
  - `list_remote_site_files`
  - `read_remote_site_file`
  - `write_remote_site_file`
  - `edit_remote_site_file`
  - `move_remote_site_file`
  - `delete_remote_site_file`
  - `restore_remote_site_file`

Dodatkowa walidacja mid-test:

- `node --test C:\Work\mcp\tests\server_bootstrap_runtime.test.js` — PASS

Checkpoint końcowy tego etapu:

- commit:
  - `97289bd` — `feat: complete outputSchema coverage for remote site tools`
- repo:
  - `main...origin/main`
  - worktree czysty
- aktywny `server_tools.js` ma pełne `outputSchema` coverage dla całego surface `55` tooli
- `node --check C:\Work\mcp\server_tools.js` — PASS
- `node --check C:\Work\mcp\stc_safe.js` — PASS

Domknięty dodatkowy podslice:

- filesystem read/info:
  - `get_info`
  - `list_directory`

Aktualne `npm test` po tym podslicu historycznie:

- `npm test` — PASS `179/179`

Domknięty dodatkowy podslice:

- filesystem mutation:
  - `write_file`
  - `append_file`
  - `copy_path`
  - `move_path`
  - `delete_path`
  - `restore_path`
  - `edit_file_patch`

Aktualne `npm test` po pełnym `7.3`:

- `npm test` — PASS `180/180`

## 7. Deploy / rollback / perf

Potwierdzone:

- `deploy.ps1`
- `rollback.ps1`
- `perf.ps1`
- lokalna historia deployów w `.mcp_deploy`
- backupi deployów w `.mcp_deploy_backup`

Obowiązujący model dla zmian runtime MCP:

- staging w `.mcp_warzone`
- manifest w `.mcp_deploy`
- `Prepare`
- `Execute`
- restart serwera
- reconnect klienta, jeśli zmienił się tool surface / schemy / descriptor metadata
- runtime verification
- rollback w razie potrzeby

Zmiany testów i dokumentacji repo nie są automatycznie zmianami runtime MCP i nie wymagają domyślnie deploy pipeline, restartu ani reconnectu.

## 8. Testy

Aktualny checkpoint potwierdzony lokalnie po korektach test surface:

- staging validation `mcp_contract_surface_web_tools_v1`:
  - `node --check .mcp_warzone\mcp_contract_surface_web_tools_v1.test.js` — PASS
  - `node --test .mcp_warzone\mcp_contract_surface_web_tools_v1.test.js` — PASS `4/4`
- deploy validation testu `mcp_contract_surface_web_tools_v1`:
  - `deploy.ps1 -Mode Prepare` — PASS
  - `deploy.ps1 -Mode Execute` — PASS
  - post-deploy `npm test` — PASS `68/68`
- staging validation `registry_execute_v1_1_runtime_surface`:
  - `node --check .mcp_warzone\registry_execute_v1_1_runtime_surface.test.js` — PASS
  - `node --test .mcp_warzone\registry_execute_v1_1_runtime_surface.test.js` — PASS `7/7`
- repo validation po aktualizacji `tests/registry_execute_v1_1.test.js`:
  - `npm test` — PASS `69/69`
- repo validation po wdrożeniu `project_truth_audit`:
  - `npm test` — PASS `74/74`
- repo validation po wdrożeniu `code_runtime_map`:
  - `npm test` — PASS `76/76`
- repo validation po wdrożeniu `deploy_decision_guard`:
  - `npm test` — PASS `79/79`
- repo validation po wdrożeniu `change_workflow_simulator`:
  - `npm test` — PASS `82/82`
- repo validation po wdrożeniu bounded `check_npm_package`:
  - `npm test` — PASS `83/83`
- repo validation po wdrożeniu `fetch_github_file`:
  - `npm test` — PASS `84/84`
- repo validation po wdrożeniu `tool_usage_snapshot`:
  - `npm test` — PASS `86/86`
- repo validation po synchronizacji bootstrap/auth i contract surface dla `remote_site_*`:
  - `npm test` — PASS `164/164`
- live MCP verification po restarcie `server_tools.js`:
  - `project_truth_audit` — `status: ok`
  - `drifts: []`
  - `code_runtime_map` — `status: ok`
  - aktywne grupy runtime obejmują `truth tools`
  - `deploy_decision_guard` — `status: ok`
  - poprawna klasyfikacja scenariuszy `repo_only` i `runtime_with_client_refresh`
  - `change_workflow_simulator` — `status: ok`
  - poprawna symulacja scenariuszy `repo_only` i `runtime_with_client_refresh`
  - `check_npm_package("is-number")` — `status: ok`
  - `check_npm_package("zod")` — `status: ok`
  - `fetch_github_file("colinhacks/zod", "main", "package.json")` — `status: ok`
  - `tool_usage_snapshot()` — `status: ok`
  - snapshot potwierdził, że bieżące web/research usage pozostaje bounded i nie daje jeszcze dowodu potrzeby `download_docs`
- live MCP verification po restarcie `server_tools.js` i restarcie Codexa na `2026-05-07` potwierdziła obecność `run_process` i `process_runner_status` w aktywnym tool surface oraz `status: ok` dla `run_process(command=node, args=[--version], cwd=mcp)`; `process_runner_status` potwierdził też politykę `inherits_full_parent_env: false`

Obszary objęte testami:

- runtime paths
- policy/path guards
- import integrity
- deploy script
- rollback script
- perf script
- recovery no-legacy import
- MCP descriptor contract dla pełnego aktywnego surface `server_tools.js`, w tym web tools
- MCP descriptor contract dla pełnego aktywnego surface `server_tools.js`, w tym truth tools
- multi-root config parsing i alias-based path policy
- MCP result-shape helpers
- registry safe layer
- registry execute simulation
- registry execute v1.1 assertions czytające aktywny runtime `core/registry_tools_safe.js`, nie staging artifact
- registry outputSchema runtime guards, w tym `tool_registry_execute`
- truth tools contract i handler baseline dla `project_truth_audit`
- truth tools contract i handler baseline dla `code_runtime_map`
- truth tools contract i handler baseline dla `deploy_decision_guard`
- truth tools contract i handler baseline dla `change_workflow_simulator`
- truth tools contract i handler baseline dla `tool_usage_snapshot`
- process tools
- remote site tools contract i handler baseline dla `run_process` i `process_runner_status`
- web tools static/runtime-shape guards
- bounded npm package metadata guard
- bounded GitHub raw file guard

### Ważne ograniczenie

Nie wszystkie testy są równie mocne, jak sugerują nazwy.

Potwierdzone luki:

- brak potwierdzonych aktywnych luk w zakresie dwóch zamkniętych punktów: web tools coverage i registry execute v1.1 source path

Zamknięte luki:

- `tests/mcp_contract_surface.test.js` obejmuje teraz web tools wystawiane przez runtime
- `tests/registry_execute_v1_1.test.js` czyta aktywny runtime file `core/registry_tools_safe.js` i sam test nie zależy już od pliku w `.mcp_warzone`

## 9. Wymagania środowiskowe Python

Potwierdzone:

- `core/science_tools.js` uruchamia helpery Python przez `python`
- helpery Python żyją w `core/`
- wymagania operacyjne są opisane w:
  - `docs/reference/PYTHON_RUNTIME_REQUIREMENTS.md`

## 10. Najważniejsze otwarte nieprawidłowości

1. Część dokumentacji reference nadal wymaga ostrożnego porównywania z aktywnym runtime przed użyciem jako source-of-truth.
2. `docs/archive/MCP_TOOL_CONTRACTS.md` opisuje w części stary workflow i nie może być traktowany jako aktualna instrukcja operacyjna bez porównania z nowszymi docs.
3. Starsze docs registry/design nadal mieszają plan, historię i wdrożenie; `docs/reference/REGISTRY.md` oraz `RUNTIME_CONTRACTS_CURRENT.md` pozostają ważniejszymi źródłami dla bieżącego runtime.

## 11. Czytaj dalej

Jeśli potrzebujesz:

- zasad dokumentacyjnych: `DOCUMENTATION_GOVERNANCE_SPEC.md`
- aktualnych kontraktów runtime: `RUNTIME_CONTRACTS_CURRENT.md`
- planu dalszych prac: `ROADMAP_REGISTRY_EXECUTION.md`
- workflow operatorskiego: `MCP_OPERATOR_MANUAL.md`
- aktualnego stanu registry: `docs/reference/REGISTRY.md`
- wymagań Python: `docs/reference/PYTHON_RUNTIME_REQUIREMENTS.md`









