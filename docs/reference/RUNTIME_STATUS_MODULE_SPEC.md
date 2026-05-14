# Runtime Status Module Spec

Data: 2026-05-14  
Status: current_reference

## Cel

Wprowadzić jeden spójny provider statusu runtime, który pozwala:

- operatorowi sprawdzić stan serwera (maintenance),
- agentowi wybrać właściwy serwer przed użyciem (optimal use),
- bez ujawniania danych wrażliwych.

## Zakres

Dotyczy runtime:

- `server.js`
- `server_tools.js`
- `stc_safe.js`

Nie dotyczy:

- redesign auth (`oauth2`),
- rozszerzania STC-SAFE surface,
- nowych mutation tooli.

## Model architektury

Jedno źródło prawdy:

- `core/observability/runtime_status_provider.js` (docelowo)

Dwa interfejsy wyjścia:

1. HTTP status endpoint (np. `/runtimez` lub `/statusz`)
2. opcjonalny read-only MCP tool `runtime_status`

Reguła:

- oba interfejsy czytają ten sam provider,
- brak duplikacji logiki w handlerach transportu.

## Minimalny kontrakt payloadu

```json
{
  "status": "ok",
  "generated_at": "2026-05-14T12:00:00.000Z",
  "runtime": {
    "name": "server_tools",
    "version": "1.7.0",
    "profile": "tools",
    "auth_mode": "access"
  },
  "process": {
    "pid": 12345,
    "uptime_s": 3600
  },
  "network": {
    "host": "127.0.0.1",
    "port": 3001,
    "public_endpoint_hint": "https://modular-mcp.romionologic.dev/mcp"
  },
  "modules": {
    "enabled_ids": ["index", "filesystem"],
    "disabled_ids": ["remote_site"],
    "degraded_ids": []
  },
  "observability": {
    "audit_writable": true,
    "perf_writable": true
  },
  "health": {
    "level": "ok",
    "warnings": []
  }
}
```

Uwagi:

- `public_endpoint_hint` ma być tylko wskazówką operacyjną, nie pełnym źródłem konfiguracji.
- `degraded_ids` jest wymagane, nawet gdy puste.

## Klasy poziomu health

- `ok` — runtime działa, brak krytycznych ostrzeżeń.
- `warn` — runtime działa, ale są ostrzeżenia (np. log niezapisywalny).
- `degraded` — runtime działa częściowo lub jest w stanie ryzyka operacyjnego.
- `blocked` — status nie może być wiarygodnie wygenerowany.

## Security boundary (must)

Payload nie może zawierać:

- tokenów,
- sekretów,
- pełnych env vars,
- surowych nagłówków auth,
- pełnych ścieżek prywatnych kluczy,
- danych umożliwiających eskalację.

Dozwolone są tylko:

- bounded metadata diagnostyczne,
- jawnie zredagowane wartości typu `***redacted***`, jeśli potrzebne.

## Relacja do module gating

Provider musi korzystać z już istniejącego modelu:

- `enabled_ids`
- `disabled_ids`

Źródło:

- bootstrap/runtime module inventory, nie heurystyka po plikach.

## Minimalny plan implementacji

1. Dodać provider `runtime_status_provider.js` (read-only, bez side effects).
2. Podłączyć endpoint HTTP:
   - `server.js` i `server_tools.js` (lokalne profile),
   - `stc_safe.js` (connector-safe profile) w zgodzie z jego ograniczeniami.
3. Opcjonalnie dodać tool `runtime_status` tylko do `server_tools.js` (nie do STC-SAFE).
4. Dodać testy:
   - shape payloadu,
   - brak pól wrażliwych,
   - zgodność `enabled/disabled` z runtime posture,
   - poziomy `health`.
5. Zsynchronizować `CURRENT_STATE.md` i `RUNTIME_CONTRACTS_CURRENT.md`.

## Non-goals (teraz)

- brak agregacji multi-host,
- brak remote control,
- brak auto-remediation,
- brak polling daemon,
- brak push-notifications.

