# MCP OpenAI — NEXT START

## Stan

- STEP 2 zakończony (annotations wdrożone)
- STEP 3 aktywny (runtime sanity + contract tests)
- IO FIX obowiązuje (structuredContent-first)
- Runtime stabilny

## 🔴 KRYTYCZNE (STAŁE)

➡️ MCP_INTEGRATION_ISSUES.md

RULE-IO-001:
structuredContent = primary channel danych

---

## Aktualny cel

➡️ STEP 3.4 — runtime verification + contract execution

---

## Następny krok (TECH)

1. uruchomić `_mcp_next/contract_check.js`
2. potwierdzić brak regresji w:
   - annotations
   - classification
   - structuredContent

---

## Następny krok (TEST)

- restart MCP
- smoke test:
  - read_file
  - read_file_lines
  - read_file_chunk
  - index_status

---

## Zasady

- NIE zmieniać IO (structuredContent.text)
- NIE ruszać auth
- NIE refactorować responses.js przed testami

---

## Kryterium zakończenia

✔ contract_check.js przechodzi
✔ runtime działa po restarcie
✔ brak regresji IO
