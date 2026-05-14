# LLM Full Handoff

Data: 2026-05-04
Status: historical_reference
Zakres: pełny handoff dla kolejnego modelu LLM, obejmujący chronologię prac, ustalenia audytowe, workflow i zasady dalszego prowadzenia projektu

## Cel

Ten dokument ma pozwolić kolejnemu modelowi LLM wejść w projekt `C:\Work\mcp` bez utraty kontekstu i bez powtarzania wcześniejszych błędów.

To nie jest krótki prompt. To jest pełny handoff operacyjny:

- co było robione,
- co zostało już ustalone,
- co jest potwierdzone,
- co nadal jest ryzykiem,
- jak wolno pracować dalej,
- jak prowadzić dokumentację.

## Najkrótsza wersja

Masz pracować jak inżynier, działać jak inżynier i podejmować decyzje jak inżynier.

Nie zgadujesz.
Nie konfabulujesz.
Nie omijasz workflow.
Nie kopiujesz zmian bezpośrednio do runtime.
Nie traktujesz dokumentacji jako prawdy wyższej niż kod.
Nie traktujesz samego istnienia pliku jako dowodu wdrożenia.

## Rola użytkownika

Rola użytkownika jest ograniczona do:

- wykonywania komend w PowerShell, jeśli to potrzebne,
- restartowania serwera:
  - `node C:\Work\mcp\server_tools.js`
- odświeżania aplikacji klienckiej, która wystawia tools z tego MCP dla modelu LLM.

Nie wolno przerzucać na użytkownika:

- analizy architektury,
- identyfikacji ryzyk,
- decyzji inżynierskich,
- rekonstrukcji dokumentacji,
- ustalania, co jest wdrożone, a co tylko opisane.

## Twarde zasady pracy

### 1. Zakaz bezpośredniego kopiowania

Zmiany nie mogą być kopiowane bezpośrednio do runtime.

Najpierw przygotowujesz je w:

- `C:\Work\mcp\.mcp_warzone`

Potem obowiązuje ścieżka:

1. validate,
2. deploy,
3. restart serwera przez użytkownika,
4. odświeżenie klienta przez użytkownika,
5. verification,
6. rollback, jeśli trzeba.

### 2. `C:\Work\mcp` to runtime, nie staging

Nie wolno:

- eksperymentować bezpośrednio na runtime,
- "robić małego wyjątku",
- obchodzić deploy/rollback, bo zmiana wygląda banalnie.

### 3. Dowód wdrożenia

Za dowód wdrożenia uznawaj dopiero połączenie:

- kodu w aktywnym runtime path,
- poprawnego wpięcia w entrypoint,
- przejścia testów lub walidacji,
- zgodności z control-plane deploy/rollback.

Nie uznawaj za dowód wdrożenia:

- samego pliku,
- wpisu w docs,
- pliku w `.mcp_warzone`,
- roadmapy,
- pamięci poprzedniego modelu.

## Bootstrap narzędzi

W tym środowisku użytkownik może na początku rozmowy wymuszać jawne sprawdzenie narzędzi, bo część modeli błędnie twierdzi, że „nie ma narzędzi”, zanim zrobi discovery.

Jeśli użytkownik napisze:

- `Sprawdź narzędzia (api_tool.list_resources)`

to oznacza:

- wykonaj discovery zasobów MCP,
- nie zgaduj,
- nie odpowiadaj automatycznie, że narzędzi nie ma,
- dopiero po sprawdzeniu opisz, co jest dostępne.

To jest obowiązkowy krok bootstrapowy, jeśli użytkownik go wskazuje.

## Co już zostało zrobione

### Etap 1. Audyt rekonstrukcyjny poza repo

Najpierw powstały dokumenty robocze poza repo, których celem było odtworzenie warstw projektu bez ryzyka namieszania w `C:\Work\mcp`.

Powstały:

- `mcp_audit_2026-05-02.md`
- `mcp_reconstruction_master_2026-05-02.md`
- `mcp_claims_matrix_2026-05-02.md`
- `mcp_runtime_annex_2026-05-02.md`

Ich rola była rekonstrukcyjna i pomocnicza. Nie są canonical docs repo.

### Etap 2. Potwierdzenie rzeczywistego flow runtime

Zostało ustalone i potwierdzone:

- `server_tools.js` działa lokalnie na:
  - `http://127.0.0.1:3001/mcp`
- auth działa przez `MCP_TOKEN`
- `core/auth.js` akceptuje:
  - `?token=...`
  - `Authorization: Bearer ...`
- użytkownik używa:
  - `cloudflared tunnel --url http://127.0.0.1:3001`
- ChatGPT Desktop łączy się przez publiczny URL do `/mcp?token=...`

Ważne:

- to było potwierdzone przez kod,
- log uruchomienia,
- dostarczone logi i screenshoty.

Jednocześnie został wyłapany problem:

- w pewnym momencie tunel działał, ale origin `127.0.0.1:3001` odmawiał połączeń,
- czyli problem był po stronie dostępności serwera, nie po stronie auth.

### Etap 3. Pierwszy pełniejszy audyt repo i docs

Potem wykonano głębszy audyt repo:

- kodu,
- worktree,
- testów,
- control-plane,
- lokalnych artefaktów operatorskich,
- dokumentacji.

W tym etapie potwierdzono m.in.:

- repo jest na `main` z `origin/main`,
- `npm test` przechodziło,
- `server_tools.js` rejestruje:
  - index tools
  - filesystem tools
  - science tools
  - safe code tools
  - safe registry tools
- istnieją dwa serwery:
  - `server.js`
  - `server_tools.js`
- control-plane ma:
  - `deploy.ps1`
  - `rollback.ps1`
  - `perf.ps1`

### Etap 4. Reorganizacja dokumentacji w `docs/`

W repo powstała nowa warstwa canonical docs:

- `docs/README.md`
- `docs/CURRENT_STATE.md`
- `docs/DOCS_CATALOG.md`
- `docs/AUDIT_2026-05-03.md`

Następnie została ona rozszerzona o:

- `docs/AUDIT_2026-05-03_DEEP.md`
- `docs/OPENAI_MCP_CONFORMANCE_2026-05-03.md`
- `docs/LLM_EXECUTION_BRIEF.md`

oraz skorygowano rolę:

- `docs/MCP_INDEX.md`

### Etap 5. Rozszerzony audyt techniczny

Zostało sprawdzone nie tylko `docs`, ale też:

- runtime code,
- kontrakty MCP,
- result shape,
- annotations,
- output schemas,
- testy,
- skrypty deploy/rollback/perf,
- zależności Python,
- zgodność z:
  - `docs/openai_apps_mcp_extract.md`
  - `docs/openai_apps_mcp_research_v2.md`

## Co jest dziś potwierdzone

### Runtime

Potwierdzone są dwa serwery:

- `server.js`
- `server_tools.js`

Potwierdzone dla `server_tools.js`:

- port `3001`,
- `StreamableHTTPServerTransport`,
- auth przez `MCP_TOKEN`,
- startup recovery,
- active tool surface z safe modules.

### Tool surface

Potwierdzone aktywne grupy:

- index tools,
- filesystem tools,
- science tools,
- connector-safe code tools,
- connector-safe registry tools.

### Registry safe layer

Potwierdzone exposed tools:

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_plan`

To jest warstwa:

- read-only,
- connector-safe,
- no-dispatch,
- no-execution,
- plan-only na najwyższym aktywnym poziomie.

### Control-plane

Potwierdzone:

- `deploy.ps1`
- `rollback.ps1`
- `perf.ps1`
- `.mcp_deploy`
- `.mcp_deploy_backup`

### Testy

Potwierdzone:

- `npm test` przechodziło `43/43`

Testy obejmują m.in.:

- registry safe layer,
- deploy,
- rollback,
- perf,
- ścieżki i guards.

## Najważniejsze findings, których nie wolno zgubić

### F1. Safe runtime nadal nie jest całkowicie odcięty od legacy full profile

Najmocniejsze ustalenie audytu:

- `server_tools.js` używa safe tool surface,
- ale startup recovery nadal importuje `rollbackPatchForRecovery` z:
  - `core/code_tools.js`

To oznacza:

- safe runtime nadal ma twarde sprzężenie z legacy write-capable module,
- regresja w `core/code_tools.js` może wpływać na start `server_tools.js`.

### F2. Zależności Python dla `science_tools` są realne, ale słabo ujawnione

Potwierdzone:

- `core/science_tools.js` używa `spawn("python", ...)`,
- helpery Python znajdują się dziś w:
  - `core/fits_info.py`
  - `core/hdf5_info.py`
  - `core/table_profile.py`

Problem:

- `package.json` tego nie opisuje,
- repo root `README.md` nadal mówi o nieistniejącym dziś `science_py/`.

### F3. Zgodność z OpenAI MCP / Apps jest tylko częściowa

Dobre rzeczy:

- annotations są obecne,
- transport jest poprawny,
- IO tools mają `outputSchema`,
- `structuredContent` jest traktowane poważnie.

Luki:

- większość tooli nie ma `outputSchema`,
- `_meta` nie jest używane,
- nie ma aktywnego resource/widget layer,
- `content` bywa ciężkim duplikatem `structuredContent`.

### F4. Dokumentacja była głównym źródłem chaosu

Kod okazał się czytelniejszy niż docs.

Problemem były mieszanki:

- current state,
- roadmapy,
- incident notes,
- historical notes,
- staging memory,
- operator notes.

Dlatego powstała nowa warstwa canonical docs.

### F5. Root `README.md` jest częściowo nieaktualne względem runtime

Najważniejsze rozjazdy:

- błędny trop `science_py/`,
- zbyt słaby opis aktywności audit/perf względem realnego kodu i testów.

## Obowiązkowa kolejność czytania dla kolejnego LLM

Czytaj na start w tej kolejności:

1. `C:\Work\mcp\docs\README.md`
2. `C:\Work\mcp\docs\CURRENT_STATE.md`
3. `C:\Work\mcp\docs\AUDIT_2026-05-03_DEEP.md`
4. `C:\Work\mcp\docs\OPENAI_MCP_CONFORMANCE_2026-05-03.md`
5. `C:\Work\mcp\docs\LLM_EXECUTION_BRIEF.md`
6. `C:\Work\mcp\docs\DOCS_CATALOG.md`
7. `C:\Work\mcp\docs\MCP_OPERATOR_MANUAL.md`

Potem dopiero:

- `MCP_INTEGRATION_ISSUES.md`
- `REGISTRY_RUNTIME_DESIGN.md`
- `MCP_TOOL_CONTRACTS.md`
- `MCP_STEP_LOG.md`

## Jak masz pracować dalej

### Zasada ogólna

Najpierw model systemu, potem ograniczenia, potem decyzja, potem implementacja.

### Obowiązkowy workflow

1. ustal current state,
2. wybierz najmniejszy sensowny krok,
3. przygotuj zmianę w `.mcp_warzone`,
4. waliduj,
5. deploy przez control-plane,
6. poproś użytkownika o restart,
7. poproś użytkownika o odświeżenie klienta,
8. zweryfikuj wynik,
9. w razie problemu użyj rollback.

### Czego nie robić

- nie przerabiać kilku warstw naraz bez potrzeby,
- nie robić bezpośrednich zmian w runtime z pominięciem workflow,
- nie dopisywać docs na podstawie przypuszczeń,
- nie ogłaszać czegoś jako wdrożone bez dowodu w runtime path,
- nie kazać użytkownikowi samemu rozumieć architektury zamiast Ciebie.

## Jak prowadzić dokumentację

### Dokumentacja ma być systemem kontrolowanym

Każdy ważny dokument musi mieć:

- `Data`
- `Status`
- `Zakres`

Każdy dokument ma należeć do jednej z warstw:

- canonical_current
- current_reference
- historical_reference
- staging_or_local_only_reference
- contradicted_in_part

### Reguły aktualizacji

1. Jeśli zmienia się stan bieżący:
   - aktualizuj `docs/CURRENT_STATE.md`
2. Jeśli powstaje nowy duży audyt:
   - dodaj nowy datowany dokument audytowy
3. Jeśli zmienia się hierarchia lub świeżość dokumentów:
   - aktualizuj `docs/README.md`
   - aktualizuj `docs/DOCS_CATALOG.md`
   - w razie potrzeby `docs/MCP_INDEX.md`
4. Jeśli dokument przestaje być source-of-truth:
   - nie usuwaj go od razu,
   - obniż jego rangę i oznacz status

### Dokumentacja nie może

- mieszać planu z wdrożeniem bez etykiety,
- mieszać historii z normą bez etykiety,
- twierdzić, że wszystko w `docs/` ma ten sam autorytet,
- udawać, że jeden skrótowy plik wystarczy za cały model systemu.

## Rekomendowany harmonogram dalszej pracy

### Faza 1. Ustalenie prawdy operacyjnej

Cel:

- zbudować prawdziwy model systemu z plików i runtime path, nie z opowieści.

Kryterium zakończenia:

- każdy ważny subsystem umiesz sklasyfikować jako:
  - active runtime
  - local control-plane
  - legacy residue
  - staged/prepared-only

### Faza 2. Stabilizacja granic bezpieczeństwa

Cel:

- odciąć safe runtime od legacy tam, gdzie to nadal jest twardo spięte.

Punkt startowy:

- dependency `server_tools.js -> core/code_tools.js` przez recovery.

### Faza 3. Domknięcie kontraktów MCP

Cel:

- descriptor completeness,
- output schema coverage,
- result-shape tests,
- ograniczenie duplikacji `content` / `structuredContent`.

### Faza 4. Domknięcie wymagań środowiskowych

Cel:

- jawny opis zależności Python i innych ukrytych wymagań runtime.

### Faza 5. Utrzymanie dokumentacji w ryzach

Cel:

- żadna duża zmiana nie kończy się bez aktualizacji canonical docs.

## Jak masz zacząć pierwszą odpowiedź

Zacznij od krótkiego potwierdzenia, że rozumiesz:

- aktywny model systemu,
- ograniczoną rolę użytkownika,
- zakaz bezpośredniego kopiowania,
- obowiązkowy workflow `.mcp_warzone -> validate -> deploy/rollback`,
- obowiązek prowadzenia dokumentacji jako systemu kontrolowanego.

Następnie podaj:

1. bieżący stan projektu na podstawie plików,
2. najbliższe ryzyko,
3. najmniejszy sensowny kolejny krok,
4. sposób walidacji tego kroku,
5. które dokumenty canonical zostaną zaktualizowane po jego wykonaniu.

## Wersja do wklejenia do nowej rozmowy

```text
Masz pracować jak inżynier, działać jak inżynier i podejmować decyzje jak inżynier.

Projekt: C:\Work\mcp

Nie zgaduj. Nie konfabuluj. Nie omijaj workflow. Nie kopiuj zmian bezpośrednio do runtime. Nie traktuj dokumentacji jako prawdy wyższej niż kod. Nie traktuj samego istnienia pliku jako dowodu wdrożenia.

Jeśli na początku dostaniesz polecenie `Sprawdź narzędzia (api_tool.list_resources)`, to najpierw wykonaj jawne sprawdzenie zasobów MCP i dopiero potem mów, jakie narzędzia są dostępne.

Najpierw czytaj:
1. C:\Work\mcp\docs\README.md
2. C:\Work\mcp\docs\CURRENT_STATE.md
3. C:\Work\mcp\docs\AUDIT_2026-05-03_DEEP.md
4. C:\Work\mcp\docs\OPENAI_MCP_CONFORMANCE_2026-05-03.md
5. C:\Work\mcp\docs\LLM_EXECUTION_BRIEF.md
6. C:\Work\mcp\docs\LLM_FULL_HANDOFF_2026-05-04.md
7. C:\Work\mcp\docs\DOCS_CATALOG.md

Moja rola jako użytkownika jest ograniczona do:
- wykonywania komend w PowerShell, jeśli to konieczne,
- restartowania serwera: node C:\Work\mcp\server_tools.js
- odświeżania aplikacji klienckiej, która wystawia tools z tego MCP dla modelu LLM.

Nie wolno Ci przerzucać na mnie analizy architektury, oceny ryzyk ani decyzji inżynierskich.

Twarde zasady workflow:
- zabronione jest bezpośrednie kopiowanie zmian do runtime,
- zmiany mają być najpierw przygotowywane w: C:\Work\mcp\.mcp_warzone
- potem obowiązkowo: validate -> deploy/rollback
- C:\Work\mcp to runtime produkcyjny, nie staging i nie piaskownica,
- sama obecność pliku nie jest dowodem wdrożenia,
- plik w .mcp_warzone nie jest wdrożeniem,
- wpis w dokumentacji nie jest wdrożeniem bez potwierdzenia w runtime path.

Interesują mnie:
- aktualny stan rzeczywisty,
- rzeczy nieprawidłowe,
- ryzyka,
- pozostałości po błędnych wcześniejszych wdrożeniach,
- luki między dokumentacją a kodem,
- zgodność kontraktów i workflow,
- zalecenia z priorytetami.

Dokumentację prowadź jak system kontrolowany:
- każdy ważny dokument musi mieć Data, Status, Zakres,
- rozdzielaj current, reference, historical, staging/local-only,
- aktualizuj CURRENT_STATE.md przy zmianie stanu,
- dodawaj nowy datowany audyt przy dużym audycie,
- aktualizuj README.md i DOCS_CATALOG.md, gdy zmienia się hierarchia lub aktualność informacji,
- nie usuwaj historii bez potrzeby,
- nie opisuj czegoś jako aktywnego tylko dlatego, że plik istnieje.

Zacznij od:
1. potwierdzenia, że rozumiesz te zasady,
2. opisu bieżącego stanu projektu na podstawie plików,
3. wskazania najbliższego ryzyka,
4. wskazania najmniejszego sensownego kolejnego kroku,
5. opisu jak ten krok będzie walidowany przed deploy.
```
