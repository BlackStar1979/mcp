# MCP docs — Normalization and Editorial Redaction Strategy

Data: 2026-05-14
Status: current_reference
Zakres: robocza strategia porządkowania dokumentacji `C:\Work\mcp\docs` bez utraty pamięci operacyjnej, architektonicznej i incydentowej

## Cel

Ten dokument nie jest nową specyfikacją nadrzędną. Tę rolę pełni:

- `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`

Ten plik mówi co innego:

- jak wykonywać porządki dokumentacyjne,
- co wolno upraszczać,
- czego nie wolno wycinać,
- jak odróżnić bieżącą prawdę od historycznego śladu,
- jak normalizować katalog `docs/` bez tworzenia nowego chaosu.

To jest dokument wykonawczy dla kolejnego modelu albo operatora, który ma redukować dług redakcyjny.

## 1. Rdzeń doktryny redakcyjnej

### 1.1. Zachowanie wiedzy jest ważniejsze niż estetyka

Historia projektu MCP nie jest śmieciem.

Nie wolno po cichu usuwać:

- lekcji z CI,
- rollbacków,
- findings z ChatGPT Desktop,
- ograniczeń auth,
- dawnych błędów runtime bootstrap,
- reguł workflow, które powstały po awariach,
- dokumentów pokazujących, dlaczego pewna architektura została odrzucona.

Jeśli coś nie jest już bieżące:

- zdegraduj status,
- przenieś do `docs/archive/`,
- zostaw odwołanie z miejsca canonical, jeśli wiedza nadal ma wartość.

### 1.2. Bieżąca prawda ma dominować

Normalizacja ma zmniejszać czas potrzebny na odpowiedź:

```text
czy serwer działa jeszcze tak czy już tak
```

To oznacza:

- current truth ma być krótka,
- ma być na wierzchu,
- ma wskazywać aktywny runtime,
- ma wygrywać z dawnym planem, dawnym audytem i dawnym handoffem.

### 1.3. MCP docs to nie tylko archiwum

`docs/` ma jednocześnie spełniać rolę:

- bieżącego source-of-truth,
- podręcznika operatora,
- mapy kontraktów runtime,
- pamięci incydentów,
- i punktu wejścia dla kolejnego modelu.

Dlatego porządkowanie nie może kończyć się na:

```text
przenieś stare pliki do archive
```

Potrzebna jest też normalizacja hierarchii i ścieżki czytania.

## 2. Główny problem, który ta strategia rozwiązuje

Problem nie polegał wyłącznie na liczbie plików.

Problem polegał na tym, że:

- stan bieżący,
- plan,
- kontrakt,
- incydent,
- historia

wizualnie współistniały na tym samym poziomie.

Efekt:

- model mógł czytać stary plik jak aktualny,
- dawny snapshot wyglądał jak aktywny status,
- plan mógł być mylony z wdrożeniem,
- research mógł udawać specyfikację.

To jest:

```text
editorial normalization debt
```

a nie brak wiedzy o samym runtime.

## 3. Docelowy kształt katalogu

Top-level `docs/` ma pozostać mały i czytelny.

Na wierzchu powinny być tylko:

- `README.md`
- `DOCUMENTATION_GOVERNANCE_SPEC.md`
- `CURRENT_STATE.md`
- `RUNTIME_CONTRACTS_CURRENT.md`
- `ROADMAP_REGISTRY_EXECUTION.md`
- `MCP_OPERATOR_MANUAL.md`
- `OPERATIONS_DEPLOY.md`
- `DOCS_CATALOG.md`
- foldery:
  - `reference/`
  - `incidents/`
  - `research/`
  - `archive/`

Jeśli pojawia się kolejny top-level plik, trzeba najpierw odpowiedzieć:

- dlaczego nie może należeć do jednej z istniejących klas,
- dlaczego nie powinien być tylko sekcją w canonical doc,
- kto będzie go czytał jako pierwszy.

## 4. Znaczenie folderów

### 4.1. `reference/`

Tu trafiają aktywne, użyteczne, ale nie nadrzędne dokumenty tematyczne.

Przykłady:

- `REGISTRY.md`
- `PYTHON_RUNTIME_REQUIREMENTS.md`
- `KNOWN_ISSUES_CONNECTOR_LAYER.md`
- `LLM_EXECUTION_BRIEF.md`
- `LLM_IDIOT_PROOF_PROTOCOL_2026-05-04.md`

Reguła:

- reference może pomagać,
- ale nie może udawać canonical set.

### 4.2. `incidents/`

Tu trafiają incydenty, które mają trwałą wartość operacyjną.

Reguła:

- incident zachowuje pełny opis,
- ale jego wniosek musi być też skondensowany do `CURRENT_STATE.md` albo `RUNTIME_CONTRACTS_CURRENT.md`.

### 4.3. `research/`

Tu trafiają materiały rozpoznawcze i porównawcze.

Reguła:

- research nie jest source-of-truth dla aktywnego runtime,
- research wspiera przyszłe decyzje,
- research nie może być czytany jak wdrożona architektura.

### 4.4. `archive/`

Tu trafiają:

- dawne snapshoty,
- timeline’y,
- stare audyty,
- przeterminowane roadmapy,
- staging notes,
- handoffy, które nie są już aktywne.

Reguła:

- archive nie jest śmietnikiem,
- archive ma zachować pamięć,
- ale nie może utrudniać odpowiedzi na pytanie o stan bieżący.

## 5. Co robić podczas porządków

### 5.1. Najpierw ustal, czy plik jest current czy historyczny

Przed każdą relokacją odpowiedz:

1. czy plik opisuje aktywny runtime,
2. czy plik opisuje tylko etap pośredni,
3. czy plik zawiera jedyną wersję ważnej lekcji,
4. czy plik powiela to, co już jest w canonical docs.

Jeśli odpowiedź brzmi:

```text
to już nie jest current truth
```

to:

- przenieś do `archive/`,
- albo do `incidents/`,
- albo do `research/`,

zależnie od roli.

### 5.2. Zanim przeniesiesz plik, popraw canonical pointers

Najpierw aktualizuj odwołania w:

- `README.md`
- `DOCUMENTATION_GOVERNANCE_SPEC.md`
- `CURRENT_STATE.md`
- `RUNTIME_CONTRACTS_CURRENT.md`
- `ROADMAP_REGISTRY_EXECUTION.md`
- `MCP_OPERATOR_MANUAL.md`
- `DOCS_CATALOG.md`

Dopiero potem przenoś plik fizycznie.

Inaczej powstaje chwilowy chaos ścieżek.

### 5.3. Po przeniesieniu sprawdź, czy nie zostały aktywne stare odwołania

Minimalny sanity check:

- sprawdź wszystkie aktywne pliki poza `archive/`,
- wyszukaj stare nazwy i stare ścieżki,
- upewnij się, że dawne referencje nie wiszą już w current layer.

Stare ścieżki mogą pozostać w `archive/`, jeśli są częścią oryginalnego historycznego tekstu.

## 6. Czego nie robić

### 6.1. Nie przepisywać wszystkiego do jednego dokumentu

To znowu skończy się jednym wielkim plikiem, którego nikt nie będzie utrzymywał.

### 6.2. Nie usuwać incydentów tylko dlatego, że są stare

Jeśli incydent wytworzył nową regułę projektu, musi pozostać ślad.

### 6.3. Nie utrzymywać kilku aktywnych top-level snapshotów

Jeżeli plik jest dawnym snapshotem:

- nie powinien siedzieć na tym samym poziomie co `CURRENT_STATE.md`.

### 6.4. Nie udawać, że katalog bez treści ma sens

Puste albo mylące foldery, np. dawny `status/`, trzeba usuwać z warstwy aktywnej.

## 7. Normalizacja treści w samych plikach

### 7.1. Status ma być jawny

Każdy plik powinien mieć czytelny:

- `Status`
- `Zakres`
- i jeśli trzeba `Data`

### 7.2. Starszy plik ma sam ostrzegać, że nie jest current truth

Jeśli plik może zostać łatwo pomylony z aktualnym opisem:

- dodaj ostrzeżenie,
- zdegraduj status,
- wskaż canonical doc, który ma pierwszeństwo.

### 7.3. Powtórzenia skracaj, nie dubluj

Jeśli ważna reguła jest opisana gdzie indziej:

- zostaw krótki skrót,
- dodaj pointer,
- nie kopiuj pełnej treści trzeci raz.

## 8. Relacja do testów i runtime

Dokumentacja nie może żyć własnym życiem.

Po każdej większej zmianie trzeba sprawdzić:

- czy `CURRENT_STATE.md` mówi to, co naprawdę jest wdrożone,
- czy `RUNTIME_CONTRACTS_CURRENT.md` zgadza się z active tool surface,
- czy roadmapa odróżnia CLOSED od NEXT,
- czy operator manual nie opisuje starego restart/deploy flow.

## 9. Kiedy zatrzymać porządki

Porządki są wystarczające, gdy:

1. model ma jasny punkt wejścia,
2. top-level `docs/` nie jest przeładowany,
3. current truth jest łatwa do znalezienia,
4. stare ścieżki nie przeciekają do aktywnej warstwy,
5. historia nadal istnieje, ale nie konkuruje z canonical set.

To jest stan:

```text
usable and trustworthy
```

Nie trzeba dążyć do sterylności absolutnej, jeśli kosztowałaby utratę pamięci projektu.

## 10. Związek z przyszłą pracą

Ta strategia ma służyć dalej jako wzorzec dla kolejnych cleanup passów.

Jeśli w przyszłości znowu pojawi się:

- za dużo top-level plików,
- nowy aktywny snapshot obok `CURRENT_STATE.md`,
- research pomylony z runtime truth,
- albo historyczny etap wyglądający jak live status,

to właśnie ten dokument ma odpowiadać:

```text
jak porządkować bez niszczenia pamięci systemu
```

