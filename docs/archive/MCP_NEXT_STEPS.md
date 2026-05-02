# MCP — KOLEJNE KROKI (PLAN ROZWOJU)

Data: 2026-04-26

## Stan aktualny

Warstwa MCP:

- filesystem: stabilna
- indeks: stabilny
- duże pliki tekstowe: rozwiązane (`read_file_lines`, `read_file_chunk`)
- dane naukowe: MVP działa (`inventory_tree`, `fits_info`, `hdf5_info`, `table_profile`)

## Priorytet 1 — operacje na danych (analysis layer)

### 1. fits_extract_columns

Cel:
- wyciąganie wybranych kolumn z BinTableHDU

Wejście:
- path
- hdu_index
- columns[]
- limit_rows

Ryzyko:
- duże tabele → konieczne limity

---

### 2. hdf5_sample_dataset

Cel:
- pobranie fragmentu datasetu (slice)

Wejście:
- path
- dataset_path
- slice spec (np. [:1000])

Ryzyko:
- bardzo duże datasety → wymaga walidacji

---

### 3. table_profile (rozszerzenie)

Dodać:
- wykrywanie typów kolumn
- min/max
- histogram (opcjonalnie)

---

## Priorytet 2 — wydajność i stabilność

### 4. lazy loading + streaming

Cel:
- obsługa dużych plików bez blokowania MCP

---

### 5. cache metadanych

Cel:
- przyspieszenie powtarzalnych wywołań

Ryzyko:
- nieaktualne dane

---

### 6. limitowanie i kontrola kosztu

Dodać:
- globalne limity wyników
- guardy dla Python tools

---

## Priorytet 3 — UX / agent workflow

### 7. map_file_lines

Cel:
- automatyczne generowanie zakresów linii

---

### 8. dataset navigator

Cel:
- przechodzenie po strukturze HDF5/FITS jak po drzewie

---

### 9. pipeline tasks

Cel:
- multi-step operacje (np. filtruj → agreguj → eksportuj)

---

## Priorytet 4 — bezpieczeństwo

### 10. policy dla narzędzi destrukcyjnych

- fine-grained approval
- logowanie operacji

---

## Priorytet 5 — zgodność z OpenAI Apps SDK

### 11. outputSchema

- formalizacja structuredContent

---

### 12. _meta usage

- przeniesienie UI-related danych do _meta

---

### 13. tool annotations

- readOnlyHint
- destructiveHint

---

## Wniosek strategiczny

System przeszedł z:

```text
file reader → MCP tools → data inspection layer
```

Kolejny etap:

```text
data inspection → data analysis → pipeline execution
```

To wymaga dodania narzędzi operujących na danych, nie tylko je opisujących.

Status: roadmap ustalona.
