# MCP / OpenAI — COMPATIBILITY (CURATED)

Status: skrócona wersja operacyjna (zachowuje fakty, usuwa plan historyczny)

---

## 1. ARCHITEKTURA (FAKT)

DWA SERWERY:

- server.js → read-only (knowledge)
- server_tools.js → write + token

Zasada:

```text
NIE mieszać ról ani auth
```

---

## 2. KLUCZOWY MECHANIZM MCP (OpenAI)

Istotne pola:

```text
server_url / connector_id
authorization
allowed_tools
require_approval
```

Krytyczne:

```text
readOnlyHint → steruje approval flow
```

---

## 3. KLASYFIKACJA TOOLS (RUNTIME)

### READ-ONLY

```text
read_file
list_directory
search
fetch
index_status
```

### STATE-CHANGING

```text
append_file
copy_path
build_index
```

### DESTRUCTIVE

```text
write_file
delete_path
move_path
restore_path (overwrite!)
```

Zasada:

```text
jeśli zmienia stan → NIE jest read-only
```

---

## 4. RESULT SHAPE (WAŻNE)

```text
content → krótki opis
structuredContent → dane
```

Nie:

```text
duplikacji
sekretów

```

---

## 5. FS HARDENING (AKTUALNY STATUS)

Zrealizowane w MCP:

```text
✔ policy
✔ audit
✔ rollback
✔ anomaly
```

Braki (świadome):

```text
atomic write
mutex per path
```

---

## 6. ZASADY BEZPIECZEŃSTWA

```text
server.js → zawsze read-only
server_tools.js → zawsze token-protected
write_file → zawsze destructive
build_index → nie read-only
```

---

## 7. CO JEST NIEAKTUALNE (USUNIĘTE)

Usunięto:

```text
✖ roadmap fazowa (już wdrożona)
✖ plan stagingu
✖ patch descriptors (zrobione)
```

---

## 8. TL;DR

```text
✔ 2 serwery, 2 role
✔ readOnlyHint = klucz
✔ tools muszą mieć poprawną klasyfikację
✔ structuredContent = dane
```
