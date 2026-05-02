# INSPIRATIONAL CHAT WORKFLOW

Data: 2026-04-26

## Cel

Plik:

```text
C:\Work\inspirational\chat.txt
```

ma 4215 linii i 294990 bajtów. Nie należy próbować ładować go w całości do kontekstu. Praca powinna odbywać się partiami, z zachowaniem numerów linii źródłowych.

## Narzędzia

Podstawowe narzędzie:

```text
read_file_lines
```

Fallback techniczny:

```text
read_file_chunk
```

Nie używać `read_file` do pełnego odczytu tego pliku. `read_file` może służyć wyłącznie do krótkiego rozpoznania początku pliku albo małego prefiksu.

## Plan cięcia pliku

Zalecany rozmiar partii: 200 linii.

Zakresy robocze:

```text
L1-L200
L201-L400
L401-L600
L601-L800
L801-L1000
L1001-L1200
L1201-L1400
L1401-L1600
L1601-L1800
L1801-L2000
L2001-L2200
L2201-L2400
L2401-L2600
L2601-L2800
L2801-L3000
L3001-L3200
L3201-L3400
L3401-L3600
L3601-L3800
L3801-L4000
L4001-L4200
L4201-L4215
```

## Etap 1 — mapa pliku

Dla każdej partii należy utworzyć krótką mapę zawartości:

```text
Zakres: Lx-Ly
Tematy:
- ...
Mocne stwierdzenia:
- L...: ...
Kandydaci na hipotezy:
- H?: ... [źródło: L...]
Uwagi:
- ...
```

Mapa nie ma być pełną analizą. Ma służyć jako indeks do późniejszych precyzyjnych powrotów do linii.

## Etap 2 — przekształcanie stwierdzeń w hipotezy

Dla każdego mocnego stwierdzenia tworzyć hipotezę w formacie:

```text
ID: H001
Źródło: L123-L126
Stwierdzenie bazowe: ...
Hipoteza: Jeżeli ..., to ... / Im bardziej ..., tym ... / X może wskazywać na Y, gdy ...
Typ hipotezy: opisowa / przyczynowa / predykcyjna / diagnostyczna / normatywna
Możliwa falsyfikacja: Co musiałoby być prawdą, żeby hipoteza była fałszywa?
Dane potrzebne do testu: ...
Status: robocza
```

## Zasady jakości

1. Nie gubić numerów linii.
2. Nie parafrazować tak mocno, żeby utracić sens stwierdzenia źródłowego.
3. Oddzielać stwierdzenie bazowe od hipotezy.
4. Nie tworzyć hipotez z każdego zdania; wybierać tylko twierdzenia nośne, nietrywialne albo testowalne.
5. Oznaczać niepewność, gdy kontekst jest fragmentaryczny.
6. Po mapowaniu wracać do konkretnych zakresów przez `read_file_lines`, nie przez pełny odczyt pliku.

## Instrukcja dla agenta

Pracujesz na pliku `C:\Work\inspirational\chat.txt`. Plik ma 4215 linii, więc nie wolno próbować ładować go w całości. Używaj `read_file_lines` i pracuj partiami po 200 linii. Najpierw utwórz mapę zakresów, potem przekształcaj wybrane stwierdzenia w hipotezy. Każdy wynik musi zawierać numery linii źródłowych. Jeżeli potrzebujesz doprecyzowania, wróć do węższego zakresu linii.

## Status

Workflow przygotowany. Narzędzia `read_file_lines` i `read_file_chunk` są widoczne w Aplikacji i przeszły testy techniczne na `mcp/tools_fs.js` oraz rozpoznanie `inspirational/chat.txt`.
