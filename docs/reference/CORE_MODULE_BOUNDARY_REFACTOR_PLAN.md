# Core Module Boundary Refactor Plan

Data: 2026-05-14
Status: current_reference
Zakres: audit i plan refaktoru `C:\Work\mcp\core` tak, żeby moduły były semantycznie czytelne, opcjonalnie odpinane przy starcie i gotowe do pracy lokalnej oraz późniejszego przeniesienia na VPS

## Cel

`server_tools.js` jest modularny na poziomie bootstrapu, ale `core/` nie jest jeszcze wystarczająco klarowne semantycznie.

Problem nie polega tylko na wielkości plików. Problem polega na tym, że część plików:

- wygląda jak pojedynczy moduł,
- a w praktyce jest kontenerem wielu odpowiedzialności,
- fasadą całego subsystemu,
- albo zlepkiem runtime + helperów + kontraktów.

To zwiększa ryzyko:

- dokładania kodu w złe miejsce,
- mylenia helpera z pakietem,
- trudnego przenoszenia na VPS,
- i braku prostego mechanizmu odpinania modułów przy starcie.

## Wzorzec potwierdzony w `mcp-tests`

`C:\Work\mcp-tests\server.js` ma już prosty, działający wzorzec opcjonalnych modułów:

- `OPTIONAL_TOOLS = []`
- `envFlagEnabled(...)`
- warunkowe ładowanie narzędzia po env flagu
- walidacja eksportu modułu
- jawna widoczność opcjonalnego tool surface w self-check / startup logu

Przykład potwierdzony w plikach:

- `MCP_TEST_ENABLE_CODE_SAMPLE_JS`
- `./tools/code_sample_js`

To nie jest jeszcze pełny system pluginów, ale jest dobrym minimalnym wzorcem dla:

- bounded optional modules,
- startup-time attach/detach,
- i czytelnego rozdziału base runtime vs dodatki.

## Klasyfikacja obecnego `core/`

### A. Prawdziwe moduły o jednej odpowiedzialności

Te pliki są relatywnie czyste i nie wymagają dużej przebudowy strukturalnej:

- `audit.js`
- `auth.js`
- `auth_bearer.js`
- `perf.js`
- `paths.js`
- `fs_ops.js`
- `heavy_gate.js`
- `responses.js`
- `server_tools_bootstrap.js`
- `remote_site_metadata_manifest_writer.js`
- `remote_site_ops_logger.js`
- `remote_site_ops_metadata.js`
- `remote_site_ops_policy.js`
- `remote_site_restore_resolver.js`
- `remote_site_runtime_status.js`
- większość plików w:
  - `core/policy/`
  - `core/orchestration/`
  - `core/registry/`
  - `core/validation/`

Ocena:

- `true module`

### B. Intencjonalne runtime/package facades

Te pliki są szerokie, ale ich szerokość jest częściowo uzasadniona, bo pełnią rolę punktu wejścia dla rodziny narzędzi:

- `tools_index.js`
- `science_tools.js`
- `web_tools.js`
- `process_tools_safe.js`
- `registry_tools_safe.js`
- `stc_safe_runtime.js`

Ocena:

- `package facade`

Reguła:

- mogą pozostać szersze, ale powinny być tak jawnie traktowane w dokumentacji i strukturze katalogów

### C. Legacy / mixed-responsibility containers

Najbardziej problematyczne:

- `code_tools.js`
- `code_tools_safe.js`
- `tools_fs.js`
- `truth_tools.js`
- `remote_site_tools.js`

Ocena:

- `legacy container` albo `mixed responsibility`

Dlaczego:

#### `code_tools.js`

- stary, szeroki kontener
- miesza wiele narzędzi, rollback recovery i dawny surface
- nie powinien być dalej rozwijany jako główny punkt odpowiedzialności

#### `code_tools_safe.js`

- bezpieczny surface jest OK,
- ale nadal wiele semantycznie różnych analiz siedzi w jednym pliku,
- z czasem grozi ponownym przekształceniem w kontener

#### `tools_fs.js`

- miesza:
  - read/info
  - mutation
  - patch/edit
  - bezpośrednie `server.registerTool(...)` i `registerSafeTool(...)`
- to powinno zostać rozdzielone co najmniej na:
  - read/info
  - mutation
  - patch/edit

#### `truth_tools.js`

- skupia kilka różnych klas narzędzi:
  - audyt prawdy projektu
  - mapa runtime
  - deploy/workflow guard
  - usage snapshot
- semantycznie to już bardziej mały pakiet governance niż pojedynczy moduł

#### `remote_site_tools.js`

- to dziś front do całego subsystemu `remote_site_*`
- pod spodem istnieje już realny pakiet:
  - ops
  - metadata
  - restore
  - retention
  - runtime status
- sam plik `remote_site_tools.js` jest za szeroki i powinien stać się cieńszą fasadą

## Najważniejsza zasada docelowa

Nie chcemy kolejnego monolitu udającego modularność.

Docelowy system musi być jednocześnie:

- czytelny na PC,
- łatwy do uruchamiania lokalnie,
- łatwy do ograniczenia przez profile startowe,
- i możliwy do przeniesienia na VPS bez przepisywania architektury od zera.

To wymaga dwóch warstw:

1. **pakiety domenowe**
2. **profile runtime / startup composition**

## Docelowy model architektury

### 1. Pakiety domenowe

Każda większa rodzina powinna mieć własny katalog, jeśli przekracza sensowną wielkość albo miesza role.

Rekomendowany kierunek:

- `core/filesystem/`
  - `read_tools.js`
  - `mutation_tools.js`
  - `patch_tools.js`
  - helpery lokalne

- `core/code/`
  - `safe_tools.js`
  - helpery analizy
  - ewentualny legacy adapter tylko tymczasowo

- `core/truth/`
  - `audit_tools.js`
  - `runtime_map_tools.js`
  - `workflow_tools.js`
  - `usage_tools.js`

- `core/remote_site/`
  - cienka fasada `tools.js`
  - podkatalogi:
    - `ops/`
    - `retention/`
    - `runtime/`
    - `metadata/`

### 2. Runtime composition

`server_tools.js` nie powinien znać szczegółów każdego pliku.

Powinien składać runtime z jawnych modułów/profili.

Przykładowe profile:

- base local tools
- remote site enabled
- process enabled
- experimental enabled
- future VPS-specific profile

## Mechanizm odpinania modułów przy starcie
## Przyszły moduł statusu runtime i module posture

Po wdrożeniu startup-time module gating warto dodać osobny, bezpieczny moduł statusu serwera MCP.

Cel tego modułu nie jest użytkowy w sensie tool-use, tylko operacyjny:

- maintenance,
- szybka orientacja przed użyciem,
- rozróżnienie kilku równolegle uruchomionych serwerów/profili,
- oraz bounded telemetry bez ekspozycji danych wrażliwych.

### Minimalne wymagania

Status powinien raportować co najmniej:

- nazwę profilu/runtime (server.js, server_tools.js, stc_safe.js albo nazwa logiczna profilu),
- aktywne moduły,
- moduły wyłączone lub zdegradowane,
- auth mode,
- wersję runtime,
- uptime,
- local port / public endpoint w bezpiecznej postaci,
- stan recovery,
- podstawowy stan observability (`audit writable`, `perf writable`),
- high-level health (ok, warn, degraded).

### Dwa interfejsy statusu

Docelowo potrzebne są dwa wyjścia z jednego wspólnego źródła danych:

1. lekki HTTP status endpoint dla monitoringu (/healthz, przyszłościowo np. /runtimez lub /statusz),
2. bounded MCP status tool dla agentów i operatorów, jeśli będzie potrzebny także przez MCP.

Te dwa interfejsy nie powinny mieć osobnej logiki biznesowej. Powinny czytać z jednego wspólnego runtime-status provider.

### Wymagania bezpieczeństwa

Moduł statusu nie może zwracać:

- sekretów,
- tokenów,
- raw env vars,
- pełnych auth headerów,
- danych ułatwiających atak na host,
- szczegółów niepotrzebnych do maintenance lub use selection.

Status ma raportować rolę i stan, nie materiały wrażliwe.

### Związek z module gating

Ten moduł ma sens dopiero po startup-time module gating, bo dopiero wtedy "aktywne moduły" i "wyłączone moduły" będą miały stabilne znaczenie architektoniczne.

Dlatego kolejność powinna pozostać taka:

1. module gating,
2. startup summary aktywnych modułów,
3. dopiero potem runtime status module.

To jest wymaganie potwierdzone i zasadne.

Docelowo moduły muszą dać się:

- włączyć,
- wyłączyć,
- i jawnie zobaczyć w startup posture.

### Minimalny wzorzec v1

Tak jak w `mcp-tests`:

- env-flag per moduł/grupa
- conditional import/register
- walidacja eksportu
- startup log z listą aktywnych i wyłączonych modułów

Przykładowy kierunek nazw:

- `MCP_ENABLE_REMOTE_SITE_TOOLS=0/1`
- `MCP_ENABLE_PROCESS_TOOLS=0/1`
- `MCP_ENABLE_TRUTH_TOOLS=0/1`
- `MCP_ENABLE_WEB_TOOLS=0/1`

oraz ewentualnie:

- `MCP_TOOL_PROFILE=full|safe|vps`

### Ważna reguła

Wyłączenie ma działać **przed rejestracją**, nie przez późniejsze filtrowanie już zarejestrowanego surface.

To jest ten sam wzorzec, który wcześniej obowiązywał dla connector-safe:

- nie importuj/nie rejestruj unsafe surface,
- nie licz na to, że ktoś go potem schowa.

## PC -> VPS doctrine

Architektura nie może zakładać, że lokalny komputer jest jedynym środowiskiem.

Co musi pozostać wspólne między PC i VPS:

- granice modułów,
- profile runtime,
- sposób włączania/odpinania modułów,
- kontrakty tooli,
- observability,
- bootstrap validation,
- truth/runtime docs.

Co może być środowiskowe:

- konkretne ścieżki,
- auth secrets,
- hostname,
- tunel / reverse proxy,
- konkretna dostępność `remote_site` lub process tools.

Wniosek:

- warunki środowiskowe mają siedzieć w config/bootstrap,
- nie w tożsamości modułów.

## Kolejność refaktoru

### Etap 1 — audit + governance

Najpierw:

- zapisać klasyfikację,
- zamrozić zasady,
- nie ciąć kodu w ciemno.

Status:

- ten dokument realizuje ten etap

### Etap 2 — startup composition layer

Najpierw dobudować wspólny, jawny mechanizm:

- enable/disable flags
- active module inventory
- startup summary

bez rozcinania jeszcze wszystkich kontenerów.

To da szybki zysk operacyjny i wzorzec pod VPS.

Status:

- `DONE` — startup-time module gating działa w `server_tools.js`
- dostępne:
  - `--modules <csv>`
  - `--disable-modules <csv>`
  - `MCP_ENABLED_MODULES`
  - `MCP_DISABLED_MODULES`
- `NONE`-equivalent jest blokowane (bootstrap kończy się błędem, jeśli nie zostaje żaden moduł)
- startup wypisuje posture modułów (`enabled_ids`, `disabled_ids`, `enabled_labels`)

### Etap 3 — rozcięcie największych kontenerów

Priorytet:

1. `tools_fs.js`
2. `truth_tools.js`
3. `remote_site_tools.js`
4. `code_tools_safe.js`

`code_tools.js` traktować jako legacy surface do wygaszenia albo ograniczenia, nie jako bazę nowego porządku.

Status:

- `IN PROGRESS`
- `tools_fs.js` rozcięty i sprowadzony do fasady:
  - `core/filesystem/read_tools.js`
  - `core/filesystem/mutation_tools.js`
  - `core/filesystem/patch_tools.js`
- `web_tools.js` rozcięty i sprowadzony do fasady:
  - `core/web/http_tools.js`
  - `core/web/package_tools.js`
  - `core/web/github_tools.js`
  - `core/web/runtime.js`
- `truth_tools.js` rozcięty i sprowadzony do fasady:
  - `core/truth/audit_tools.js`
  - `core/truth/workflow_tools.js`
  - `core/truth/usage_tools.js`
  - `core/truth/shared.js`
- `remote_site_tools.js` rozcięty i sprowadzony do fasady:
  - `core/remote_site/file_ops_tools.js`
  - `core/remote_site/runtime_tools.js`
  - `core/remote_site/shared_runtime.js`
- następny cel pozostaje:
  - `code_tools_safe.js`

### Etap 4 — package naming normalization

Po rozcięciu:

- nazwy plików mają odpowiadać realnej roli:
  - moduł
  - facade
  - package entry
  - legacy adapter

## Czego nie robić

- nie rozcinać wszystkiego naraz
- nie mieszać refaktoru modułowości z oauth2
- nie mieszać tego z nowym tool surface
- nie budować VPS-only architektury obok lokalnej
- nie ukrywać kontenerów pod starymi nazwami po refaktorze

## Następny praktyczny krok

Najbardziej sensowny kolejny ruch:

1. kontynuować etap 3 od `truth_tools.js`
2. po każdym splisie utrzymywać:
   - ten sam tool contract
   - ten sam runtime behavior
   - zielone `npm test`
3. utrzymać startup posture jako wspólny mechanizm dla PC i VPS



