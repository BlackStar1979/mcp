# LLM Idiot-Proof Protocol

Data: 2026-05-04
Status: canonical_current
Zakres: bardzo prosty protokół dla kolejnego modelu LLM, żeby pracował po kolei i bez zgadywania

## Przeczytaj to jak instrukcję wykonywania pracy

Jeśli jesteś kolejnym modelem LLM, to masz zrobić dokładnie to.

Nie interpretuj kreatywnie.
Nie skracaj procesu.
Nie „ułatwiaj”.
Nie kopiuj nic bezpośrednio do runtime.

## Twoja rola

Masz być inżynierem.

To znaczy:

- najpierw rozumiesz system,
- potem wybierasz najmniejszy sensowny krok,
- potem walidujesz,
- dopiero potem wdrażasz,
- potem aktualizujesz dokumentację.

## Rola użytkownika

Użytkownik robi tylko trzy rzeczy:

1. wykonuje komendy w PowerShell, jeśli trzeba,
2. restartuje serwer:
   - `node C:\Work\mcp\server_tools.js`
3. odświeża aplikację kliencką wtedy, gdy po zmianie trzeba odnowić handshake narzędzi.

Nie przerzucaj na użytkownika:

- myślenia architektonicznego,
- klasyfikacji ryzyk,
- wyboru strategii,
- decyzji co ruszyć najpierw.

## Zasada numer 1

Nie wolno kopiować zmian bezpośrednio do runtime.

Każda zmiana runtime idzie najpierw do:

- `C:\Work\mcp\.mcp_warzone`

Zmiany `repo-only` i `test-only` nie wymagają `.mcp_warzone`, manifestu ani deploy pipeline, ale nadal wymagają walidacji i aktualizacji canonical docs, jeśli zmieniają opis systemu.

## Zasada numer 2

Po zmianie runtime w `.mcp_warzone` zawsze idzie:

1. validation
2. manifest
3. deploy Prepare
4. deploy Execute
5. restart serwera
6. refresh klienta
7. runtime verification
8. rollback, jeśli trzeba

Jeśli zmiana jest tylko `repo-only` albo `test-only`, właściwy przebieg jest krótszy:

1. lokalna walidacja
2. aktualizacja canonical docs, jeśli trzeba
3. commit
4. push

Jeśli pominiesz którykolwiek z tych kroków, pracujesz źle.

## Zasada numer 3

Dokumentacja nie jest ważniejsza od kodu.

Ale dokumentacja canonical musi być zgodna z kodem po każdej większej zmianie.

## Co masz przeczytać najpierw

1. `docs/README.md`
2. `docs/CURRENT_STATE.md`
3. `docs/AUDIT_2026-05-03_DEEP.md`
4. `docs/OPENAI_MCP_CONFORMANCE_2026-05-03.md`
5. `docs/RUNTIME_CONTRACTS_CURRENT.md`
6. `docs/LLM_FULL_HANDOFF_2026-05-04.md`
7. `docs/LLM_EXECUTION_BRIEF.md`
8. `docs/REGISTRY.md`
9. `docs/MCP_OPERATOR_MANUAL.md`
10. `docs/DOCS_CATALOG.md`

## Krok zerowy — sprawdzenie narzędzi

Zanim powiesz, że „nie ma narzędzi”, masz wykonać jawne sprawdzenie zasobów MCP.

Jeśli użytkownik napisze:

- `Sprawdź narzędzia (api_tool.list_resources)`

to masz potraktować to jako obowiązkowy bootstrap check, a nie jako luźną sugestię.

Nie wolno:

- odpowiadać odruchowo, że nie ma narzędzi,
- udawać, że nic nie wiesz o dostępnych zasobach,
- pomijać sprawdzenia tylko dlatego, że prompt był krótki.

Zasada:

- najpierw discovery,
- dopiero potem wniosek, jakie narzędzia są dostępne lub niedostępne.

## Kolejność pracy za każdym razem

### Krok 1. Ustal prawdę

Sprawdź:

- co jest aktywne w `server_tools.js`
- co jest aktywne w `server.js`
- które moduły są naprawdę rejestrowane
- jakie testy naprawdę obejmują runtime
- które docs są canonical

Nie ruszaj nic, dopóki tego nie wiesz.

### Krok 2. Nazwij problem

Powiedz jasno:

- co jest nieprawidłowe
- czy problem jest w kodzie, testach, docs czy workflow
- czy to jest problem aktywnego runtime, czy tylko dokumentacji

### Krok 3. Wybierz najmniejszy sensowny krok

Nie naprawiaj pięciu warstw naraz.

Wybierz jeden mały krok, który:

- zmniejsza ryzyko,
- zwiększa zgodność,
- da się walidować,
- da się cofnąć rollbackiem.

### Krok 4. Zrób staging

Jeśli zmiana jest runtime, przygotuj ją w `.mcp_warzone`.

Jeśli zmiana jest `repo-only` albo `test-only`, nie twórz sztucznie stagingu i nie uruchamiaj deployu bez potrzeby.

### Krok 5. Zwaliduj staging

Sprawdź:

- `node --check`, jeśli dotyczy JS
- testy lokalne
- zgodność kontraktów
- brak rozjazdu z manifestem

### Krok 6. Wdróż kontrolowanie

Przez:

- manifest w `.mcp_deploy`
- `deploy.ps1 -Mode Prepare`
- `deploy.ps1 -Mode Execute`

Ten krok dotyczy tylko zmian runtime.

### Krok 7. Poproś użytkownika tylko o to, co musi zrobić

Powiedz dokładnie:

1. jaką komendę ma uruchomić,
2. po co,
3. co będzie poprawnym wynikiem,
4. co zrobić, jeśli wynik jest zły.

### Krok 8. Zweryfikuj runtime po deployu

Nie kończ pracy po samym `npm test`.

Jeśli zmieniałeś tool:

- wywołaj ten tool po restarcie MCP
- sprawdź, czy runtime zachowuje się tak jak opisuje kontrakt

Jeśli nie zmieniałeś runtime, nie udawaj, że repo-only zmiana wymaga restartu lub reconnectu.

### Krok 9. Zaktualizuj dokumentację canonical

Minimum:

- `CURRENT_STATE.md`, jeśli zmienił się stan systemu
- odpowiedni audyt lub nowy datowany audyt
- `DOCS_CATALOG.md`, jeśli zmienił się status dokumentów
- `README.md`, jeśli zmieniła się kolejność czytania

## Harmonogram optymalny

### Faza A. Stabilność źródeł prawdy

Najpierw napraw:

1. docs canonical, jeśli są niezgodne z runtime
2. testy, które tylko udają pełne pokrycie
3. kontrakty runtime docs

Dopiero potem przechodź do nowych funkcji.

### Faza B. Testy i kontrakty

Najpierw upewnij się, że:

1. testy obejmują cały aktywny surface
2. staging-only tests nie udają runtime verification
3. result-shape i descriptor contract są pilnowane tam, gdzie naprawdę trzeba

### Faza C. Rozszerzenia

Dopiero po A i B ruszaj:

1. dalsze registry execution phases
2. kolejne outputSchema rollouty
3. dalsze web tools
4. kolejne optymalizacje

## Czego absolutnie nie robić

1. Nie zakładaj, że dokument jest aktualny tylko dlatego, że ma sensowny tytuł.
2. Nie zakładaj, że test pokrywa runtime tylko dlatego, że ma dobrą nazwę.
3. Nie zakładaj, że staging file i runtime file są identyczne.
4. Nie wdrażaj zmian runtime bez deploy/rollback.
5. Nie każ użytkownikowi samemu zrozumieć, co masz zrobić.

## Co masz powiedzieć w pierwszej odpowiedzi

Pierwsza odpowiedź ma mieć tylko to:

1. co jest dziś prawdą techniczną,
2. co jest najbliższym ryzykiem,
3. jaki jest jeden najmniejszy kolejny krok,
4. jak ten krok będzie walidowany,
5. które dokumenty zaktualizujesz po jego wykonaniu.

Jeśli tego nie robisz, to znaczy, że zaczynasz źle.
