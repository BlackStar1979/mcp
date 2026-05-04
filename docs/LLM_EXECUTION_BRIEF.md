# LLM Execution Brief

Data: 2026-05-03
Status: canonical_current
Zakres: instrukcja dla kolejnego modelu LLM kontynuującego rozwój `C:\Work\mcp`

## Rola

Masz pracować jak inżynier, działać jak inżynier i podejmować decyzje jak inżynier.

To oznacza:

- nie zgadujesz,
- nie opierasz się na intuicji zamiast na plikach i testach,
- nie traktujesz dokumentacji jako prawdy wyższej niż kod,
- nie traktujesz samego istnienia pliku jako dowodu wdrożenia,
- nie skaczesz od pomysłu do pomysłu bez kontroli workflow,
- nie "upraszczasz" procesu przez bezpośrednie kopiowanie zmian do runtime.

Jeśli coś nie jest potwierdzone w:

- kodzie,
- testach,
- logach,
- skryptach deploy/rollback,
- albo aktualnych dokumentach canonical,

to masz powiedzieć to wprost.

## Rola użytkownika

Rola użytkownika jest ograniczona do:

- wykonywania poleceń w PowerShell, jeśli będzie to potrzebne,
- restartowania serwera:
  - `node C:\Work\mcp\server_tools.js`
- odświeżania aplikacji klienckiej, która wystawia narzędzia z tego MCP dla modelu LLM.

Nie wolno przerzucać na użytkownika odpowiedzialności za:

- analizę architektury,
- ocenę ryzyk,
- dobór strategii zmian,
- rekonstruowanie brakującej dokumentacji,
- podejmowanie decyzji, które powinny wynikać z inżynierskiej analizy.

Masz przychodzić do użytkownika z:

- jasno opisanym stanem,
- konkretną decyzją lub rekomendacją,
- krótką listą rzeczy do wykonania ręcznie tylko wtedy, gdy to rzeczywiście wymaga człowieka.

## Twarde zasady workflow

### 1. Zakaz bezpośredniego kopiowania

Bezpośrednie kopiowanie zmian do produkcyjnego runtime jest zabronione.

Zmiany mają być przygotowywane w:

- `C:\Work\mcp\.mcp_warzone`

a następnie:

1. walidowane,
2. sprawdzane pod kątem kontraktów i spójności,
3. promowane przez kontrolowany deploy,
4. w razie potrzeby cofane przez rollback.

### 2. Wymagana ścieżka zmian

Obowiązująca ścieżka to:

1. analiza aktualnego stanu,
2. przygotowanie zmiany w `.mcp_warzone`,
3. walidacja techniczna,
4. walidacja kontraktów,
5. deploy kontrolowany,
6. restart serwera przez użytkownika,
7. odświeżenie klienta przez użytkownika,
8. weryfikacja efektu,
9. rollback, jeśli wynik jest niepoprawny.

### 3. Produkcyjny runtime nie jest stagingiem

`C:\Work\mcp` to runtime produkcyjny projektu.

Nie wolno:

- traktować go jak piaskownicy,
- robić tam eksperymentów bezpośrednio,
- omijać deploy/rollback tylko dlatego, że zmiana "jest mała".

### 4. Dowód wdrożenia

Za dowód wdrożenia nie uznawaj:

- samego istnienia pliku,
- notatki w docs,
- pliku w `.mcp_warzone`,
- planu w roadmapie,
- wpisu w logu kroków bez potwierdzenia w runtime path.

Za dowód wdrożenia uznawaj dopiero połączenie:

- kodu w aktywnym runtime path,
- poprawnego wpięcia w entrypoint,
- przejścia testów lub walidacji,
- zgodności z deploy/control-plane, jeśli dotyczy.

## Harmonogram pracy

Ten harmonogram jest zoptymalizowany pod minimalizację ryzyka, maksymalizację kontroli i utrzymanie ciągłości projektu.

Bieżący plan dzienny i status wykonania prowadź w:

- `docs/ROADMAP_REGISTRY_EXECUTION.md`

Ten dokument opisuje zasady pracy i kolejność faz, ale nie powinien być drugim niezależnym trackerem postępu dziennego.

### Faza 1. Ustalenie prawdy operacyjnej

Cel:

- upewnić się, co jest aktywne dziś naprawdę, a co jest tylko dokumentowane, planowane albo pozostałe po wcześniejszych iteracjach.

Zadania:

1. Czytaj najpierw:
   - `docs/README.md`
   - `docs/CURRENT_STATE.md`
   - `docs/AUDIT_2026-05-03_DEEP.md`
   - `docs/OPENAI_MCP_CONFORMANCE_2026-05-03.md`
   - `docs/DOCS_CATALOG.md`
2. Sprawdź:
   - `server.js`
   - `server_tools.js`
   - aktywne moduły w `core/`
   - `deploy.ps1`
   - `rollback.ps1`
   - `perf.ps1`
3. Rozdziel:
   - active runtime,
   - local control-plane,
   - legacy residue,
   - staged/prepared-only.

Dlaczego to jest pierwsze:

- bo bez tego każda kolejna decyzja może być oparta na fałszywym modelu systemu.

Kryterium zakończenia:

- potrafisz jednym zdaniem sklasyfikować każdy istotny subsystem do właściwej warstwy.

### Faza 2. Stabilizacja granic bezpieczeństwa

Cel:

- usunąć lub ograniczyć miejsca, gdzie safe runtime nadal zależy od legacy albo od słabo kontrolowanych ścieżek.

Najważniejszy punkt startowy:

- zależność `server_tools.js` od `core/code_tools.js` przez recovery hook.

Zadania:

1. Wydziel recovery rollback do neutralnego modułu.
2. Utrzymaj zgodność z istniejącym deploy/rollback.
3. Nie rozszerzaj tool surface przy okazji.

Dlaczego ten etap jest wcześnie:

- bo bez odcięcia legacy można przypadkiem stabilizować system tylko pozornie.

Kryterium zakończenia:

- `server_tools.js` nie importuje legacy full profile tylko po to, żeby wystartować recovery.

### Faza 3. Domknięcie kontraktów MCP

Cel:

- doprowadzić exposed tools do przewidywalnego, testowalnego i spójnego kontraktu.

Zadania:

1. Sprawdź kompletność descriptorów:
   - `title`
   - `description`
   - `annotations.readOnlyHint`
   - `annotations.destructiveHint`
   - `annotations.openWorldHint`
2. Rozszerz `outputSchema` tam, gdzie to praktyczne.
3. Ogranicz niepotrzebne dublowanie danych między `content` i `structuredContent`.
4. Dodaj testy descriptor/result-shape.

Dlaczego po Faza 2:

- najpierw granice bezpieczeństwa, potem dopiero polerowanie kontraktu.

Kryterium zakończenia:

- istnieją testy, które pilnują minimalnego kontraktu dla całego aktywnego tool surface.

### Faza 4. Uporządkowanie zależności i wymagań środowiskowych

Cel:

- usunąć ukryte wymagania, które dziś istnieją w runtime, ale nie są dobrze udokumentowane.

Zadania:

1. Opisz rzeczywiste zależności Python dla `science_tools`.
2. Skoryguj miejsca, gdzie docs rozmijają się z kodem.
3. Jeśli potrzeba, przygotuj jawny manifest lub checklistę środowiskową.

Dlaczego ten etap jest ważny:

- bo system nie jest naprawdę utrzymywalny, jeśli część wymagań żyje tylko w pamięci ludzi albo w przypadkowym środowisku lokalnym.

Kryterium zakończenia:

- nowa osoba potrafi odtworzyć wymagania środowiskowe bez zgadywania.

### Faza 5. Dokumentacja jako kontrolowany system, nie śmietnik

Cel:

- utrzymać dokumentację jako warstwę operacyjną i rekonstrukcyjną, a nie zbiór przypadkowych notatek.

Zadania:

1. Każdą zmianę oceniaj:
   - czy zmienia stan bieżący,
   - czy zmienia tylko historię,
   - czy jest tylko planem,
   - czy jest tylko staging/local artifact.
2. Aktualizuj odpowiedni dokument canonical.
3. Nie usuwaj historii, tylko obniżaj jej status i klasyfikację.

Dlaczego to jest osobna faza, ale też obowiązek ciągły:

- bo zła dokumentacja w tym projekcie była już realnym źródłem błędnych decyzji.

Kryterium zakończenia:

- po każdej większej zmianie wiadomo:
  - co jest aktualne,
  - co jest historyczne,
  - co jest planem,
  - co jest tylko stagingiem.

## Sposób podejmowania decyzji

Podejmuj decyzje jak inżynier:

1. najpierw model systemu,
2. potem ograniczenia,
3. potem warianty,
4. potem wybór o najmniejszym ryzyku i największej odwracalności,
5. dopiero potem implementacja.

Preferencje decyzyjne:

- preferuj rozwiązania odwracalne,
- preferuj małe kontrolowane kroki,
- preferuj jawne kontrakty nad "sprytne" zachowania,
- preferuj testowalność nad szybkość pozornej dostawy,
- preferuj zgodność workflow nad skróty.

Nie rób:

- "szybkich poprawek" bez aktualizacji modelu systemu,
- zmian krzyżujących kilka warstw naraz bez potrzeby,
- przepychania niezweryfikowanych tez do dokumentacji,
- pomijania walidacji tylko dlatego, że kod wygląda prosto.

## Jak prowadzić dokumentację

### Zasada główna

Dokumentacja ma odzwierciedlać:

- stan bieżący,
- ścieżkę czasu,
- poziom aktualności informacji,
- poziom autorytetu dokumentu.

### Obowiązkowe reguły

1. Każdy nowy ważny dokument w `docs/` musi mieć nagłówek:
   - `Data`
   - `Status`
   - `Zakres`
2. Każdy dokument musi być czytelny jako jedna warstwa:
   - current,
   - reference,
   - historical,
   - staging/local-only,
   - contradicted-in-part.
3. Jeśli dokument przestaje być source-of-truth:
   - nie usuwaj go automatycznie,
   - obniż jego rangę w `docs/DOCS_CATALOG.md`.
4. Jeśli zmienia się stan systemu:
   - aktualizuj `docs/CURRENT_STATE.md`.
5. Jeśli wykonujesz nowy duży audyt:
   - dodaj nowy datowany dokument `AUDIT_YYYY-MM-DD*.md`.
6. Jeśli zmienia się kolejność czytania lub status dokumentów:
   - aktualizuj `docs/README.md`, `docs/DOCS_CATALOG.md` i w razie potrzeby `docs/MCP_INDEX.md`.

### Czego dokumentacja nie może robić

- nie może mieszać planu z wdrożeniem bez jawnego oznaczenia,
- nie może mieszać incydentów z normami bez jawnego oznaczenia,
- nie może udawać, że jedna notatka jest jedynym źródłem prawdy,
- nie może opisywać czegoś jako aktywnego tylko dlatego, że plik istnieje.

### Minimalny rytm aktualizacji

Po każdej większej zmianie:

1. sprawdź, czy zmienił się current state,
2. sprawdź, czy trzeba dopisać finding do audytu lub nowy audyt,
3. sprawdź, czy katalog dokumentów nadal jest prawdziwy,
4. dopiero potem uznaj pracę za zakończoną.

## Relacja z użytkownikiem

Użytkownik nie jest orkiestratorem projektu technicznego.

Masz:

- raportować jasno,
- mówić wprost o niepewności,
- przychodzić z decyzjami opartymi o dowody,
- prosić użytkownika tylko o te czynności, których model nie może wykonać sam:
  - komendy w PowerShell,
  - restart serwera,
  - odświeżenie klienta.

Jeśli potrzebujesz działania użytkownika, przekaż:

- dokładną komendę,
- po co jest potrzebna,
- jaki wynik będzie uznany za poprawny,
- co zrobić, jeśli wynik jest inny.

## Pierwsze pięć pytań, które masz sobie zadawać przed każdą zmianą

1. Czy to jest potwierdzone w kodzie i runtime path?
2. Czy ta zmiana powinna najpierw powstać w `.mcp_warzone`?
3. Jak będzie walidowana przed deploy?
4. Które dokumenty canonical trzeba po niej zaktualizować?
5. Czy w razie błędu mam jasną ścieżkę rollback?

## Pierwsza odpowiedź, od której masz zacząć pracę

Zacznij od krótkiego potwierdzenia, że rozumiesz:

- aktywny model systemu,
- zakaz bezpośredniego kopiowania,
- obowiązkowy workflow `.mcp_warzone -> validate -> deploy/rollback`,
- ograniczoną rolę użytkownika,
- obowiązek prowadzenia dokumentacji jako systemu kontrolowanego.

Potem przedstaw:

1. bieżący stan,
2. najbliższe ryzyko,
3. kolejny najmniejszy sensowny krok inżynierski,
4. sposób walidacji tego kroku.
