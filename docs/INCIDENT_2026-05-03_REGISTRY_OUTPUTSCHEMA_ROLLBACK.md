# Incident: registry outputSchema rollout rollback

Data: 2026-05-03
Status: current_reference
Zakres: nieudany deploy `registry_outputschema_v1`, rollback i reguły zapobiegające powtórce

## 1. Streszczenie

Podczas próby rozszerzenia `outputSchema` dla `core/registry_tools_safe.js` wdrożono staging `registry_outputschema_v1`, który naruszył istniejący kontrakt testów registry.

Deploy wykonał copy, ale post-test w `deploy.ps1` wykrył regresję. Następnie wykonano rollback na podstawie deployment id:

```text
2026-05-03T11-20-51-501Z_b0b2d92f
```

Po rollbacku `npm test` ponownie przeszedł:

```text
tests 51
pass 51
fail 0
```

MCP został zrestartowany i wystartował poprawnie:

```text
MODULAR MCP running v1.7.0
RECOVERY: { status: 'recovery_ok', recovered_count: 0 }
```

## 2. Przyczyna

W stagingowym patchu użyto:

```js
policy: z.any().optional()
```

To naruszyło istniejące reguły registry safe layer. Testy `registry_v2`, `registry_v3` i `registry_v6` wymagają jawnych, płaskich schematów i blokują `z.any()`.

Przykładowy błąd testu:

```text
The input was expected to not match the regular expression /z\.any\(/
```

## 3. Co zadziałało poprawnie

- `deploy.ps1` uruchomił testy po copy.
- Regresja została wykryta automatycznie.
- `rollback.ps1 -WhatIfOnly` utworzył dry-run record.
- `rollback.ps1` przywrócił poprzedni stabilny plik.
- `npm test` po rollbacku potwierdził stan stabilny.
- Restart MCP potwierdził `recovery_ok`.

## 4. Co było błędem wykonawczym

Błąd nie leżał w rollbacku ani w testach. Błąd był wykonawczy:

1. patch przygotowano bez wcześniejszego przeczytania testów registry v2-v6,
2. zastosowano szeroki schemat zamiast jawnego kontraktu,
3. zaufano ogólnemu kontekstowi zamiast lokalnej regule projektu,
4. staging nie został odrębnie sprawdzony przeciwko regułom `explicit flat schema` przed manifestem deploy.

## 5. Reguły obowiązujące od tego incydentu

### RULE-LLM-PIPELINE-001 — najpierw lokalne reguły, potem patch

Przed zmianą w obszarze objętym testami trzeba przeczytać:

- właściwe testy,
- właściwy dokument kontraktu,
- aktualny kod runtime.

Dla registry oznacza to minimum:

- `tests/registry_v*.test.js`,
- `core/registry_tools_safe.js`,
- `docs/REGISTRY_RUNTIME_DESIGN.md`,
- `docs/MCP_TOOL_CONTRACTS.md`, jeśli zmiana dotyczy kontraktu toola.

### RULE-LLM-PIPELINE-002 — staging nie jest gotowy bez walidacji

Staging można skierować do manifestu dopiero po sprawdzeniu:

```powershell
node --check <staging-file>
```

oraz po sprawdzeniu, że staging nie łamie znanych zakazów testowych, np. `z.any()` w registry safe layer.

### RULE-REGISTRY-SCHEMA-001 — zero `z.any()` w registry safe layer

W `core/registry_tools_safe.js` nie wolno używać `z.any()` w schematach wejścia/wyjścia ani w descriptor layer.

Jeżeli struktura jest złożona, trzeba:

- rozbić ją na jawne pola,
- użyć dedykowanego schema helpera,
- albo odłożyć rollout dla danego toola.

### RULE-REGISTRY-SCHEMA-002 — outputSchema nie może osłabiać istniejących testów

Rollout `outputSchema` ma zwiększać formalizację kontraktu, nie obchodzić ją przez szerokie typy.

Niedopuszczalne jako szybkie obejścia:

- `z.any()`,
- schematy, które są w praktyce bez walidacji,
- schematy dodane tylko po to, żeby zwiększyć licznik coverage.

## 6. Następny poprawny sposób pracy nad outputSchema

Dla następnej próby `outputSchema`:

1. wybrać jeden tool albo małą grupę o prostym wyniku,
2. przeczytać testy obejmujące ten obszar,
3. przygotować jawny schema bez `z.any()`,
4. sprawdzić staging składniowo,
5. dopisać albo zaktualizować test wymuszający schema tylko dla tego zakresu,
6. dopiero wtedy przygotować manifest deploy.

## 7. Status końcowy

Incydent: `resolved by rollback`.

Aktualny runtime: stabilny.

Aktualne testy: `51/51`.

Następny rollout `outputSchema` wymaga nowego stagingu. Staging `registry_tools_safe_outputschema_v1.js` należy traktować jako odrzucony artefakt, nie jako bazę do deploy.

## 8. Follow-up: udany rollout status-only

Po incydencie wykonano poprawiony, minimalny rollout:

```text
registry_outputschema_status_v2
```

Zakres:

- tylko `tool_registry_status`,
- jeden jawny `outputSchema`,
- brak `z.any()`,
- brak `z.record()`,
- brak zmian w logice handlerów,
- brak zmian w registry v2-v6 toolach.

Deployment id:

```text
2026-05-03T11-50-44-247Z_15416e26
```

Wynik:

```text
tests 51
pass 51
fail 0
```

Wniosek:

- reguła małego zakresu zadziałała,
- `outputSchema` należy rollować iteracyjnie,
- każdy następny zakres wymaga wcześniejszego odczytania testów obejmujących dany moduł.

## 9. Follow-up: udany rollout list-only

Po udanym rollout `tool_registry_status` wykonano kolejny minimalny rollout:

```text
registry_outputschema_list_v1
```

Zakres:

- `tool_registry_list`,
- wspólny jawny schema helper `REGISTRY_TOOL_SUMMARY_OUTPUT`,
- zachowanie wcześniej wdrożonego `tool_registry_status`,
- brak `z.any()`,
- brak `z.record()`,
- brak zmian w `get_tool`, `validate_tool`, `policy`, `preflight`, `plan`.

Deployment id:

```text
2026-05-03T12-10-56-383Z_f36d5d77
```

Wynik:

```text
tests 51
pass 51
fail 0
```

Po restarcie MCP potwierdzono:

- `MODULAR MCP running v1.7.0`,
- `RECOVERY: { status: 'recovery_ok', recovered_count: 0 }`,
- `tool_registry_list` odpowiada poprawnym payloadem.

Wniosek:

- status + list są objęte jawnie zdefiniowanym `outputSchema`,
- dalszy rollout powinien przejść na `tool_registry_get_tool`, ale dopiero po osobnym rozpisaniu schematu dla wyniku `found` i `not_found`.

## 10. Follow-up: rollback get_tool outputSchema z powodu runtime error

Próba rollout `tool_registry_get_tool` z `outputSchema` opartym o `z.union([...])` przeszła testy statyczne, ale po deployu i restarcie MCP realne wywołanie toola zwróciło błąd runtime:

```text
Cannot read properties of undefined (reading '_zod')
```

Deployment id cofniętego rollout:

```text
2026-05-03T12-39-26-761Z_0847a760
```

Rollback wykonano przez:

```powershell
.\rollback.ps1 -DeploymentId 2026-05-03T12-39-26-761Z_0847a760 -WhatIfOnly
.\rollback.ps1 -DeploymentId 2026-05-03T12-39-26-761Z_0847a760
```

Po rollbacku potwierdzono:

```text
tests 51
pass 51
fail 0
```

oraz realne wywołanie:

```text
tool_registry_get_tool("code_analysis") -> status: ok
```

### RULE-REGISTRY-SCHEMA-003 — outputSchema musi przejść realne wywołanie runtime

Dla każdego nowego `outputSchema` w registry safe layer testy statyczne są niewystarczające.

Wymagany pipeline po deployu kodu:

1. `npm test`,
2. restart MCP,
3. realne wywołanie zmienionego toola przez connector,
4. rollback, jeśli realne wywołanie zwraca błąd runtime.

Brak realnego wywołania oznacza brak walidacji.

### RULE-REGISTRY-SCHEMA-004 — z.union w outputSchema jest zablokowane do czasu potwierdzenia runtime

W `core/registry_tools_safe.js` nie wolno używać `z.union()` w `outputSchema`, dopóki runtime MCP nie zostanie osobno potwierdzony jako obsługujący ten konstrukt.

Następna próba `tool_registry_get_tool` musi użyć jednego jawnego `z.object(...)` zgodnego z realnym payloadem albo zostać poprzedzona dedykowanym testem runtime.
