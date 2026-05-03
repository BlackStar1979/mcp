# Current State

Data: 2026-05-03
Status: canonical_current
Zakres: aktualny stan projektu `C:\Work\mcp` z rozdzieleniem runtime, worktree i lokalnych artefaktów

## 1. Repo i worktree

Stan gałęzi:

- `main`
- `origin/main`
- lokalny branch jest na tym samym commitcie co `origin/main`, ale worktree jest brudny

Lokalne zmiany niezatwierdzone w chwili audytu:

- `core/registry_tools_safe.js`
- `docs/MCP_INTEGRATION_ISSUES.md`
- `docs/REGISTRY_RUNTIME_DESIGN.md`

Nowe pliki nieśledzone:

- `.mcp_deploy/registry_v1a_guard.manifest.json`
- `.mcp_deploy/registry_v6_plan.manifest.json`
- `tests/registry_v6.test.js`

Wniosek:

- audyt tej daty obejmuje nie tylko ostatni zatwierdzony stan repo, ale także aktualny stan worktree.

## 2. Aktywny baseline runtime

### `server.js`

- profil read-only
- lokalny port `3000`
- zakres ograniczony do `C:\Work\mcp`
- narzędzia:
  - `search`
  - `fetch`
  - `list_directory`
  - `read_file`
  - `get_info`

### `server_tools.js`

- profil tools
- lokalny port `3001`
- auth przez `MCP_TOKEN`
- recovery przed startem
- transport `StreamableHTTPServerTransport`
- rejestruje:
  - index tools
  - filesystem tools
  - science tools
  - connector-safe code tools
  - connector-safe registry tools

## 3. Auth i tunel

### Potwierdzone

- `MCP_TOKEN` jest czytany z environment
- token może wejść:
  - przez query string `?token=...`
  - przez bearer header
- `cloudflared tunnel --url http://127.0.0.1:3001` jest używany operacyjnie
- ChatGPT Desktop używa publicznego URL do `/mcp?token=...`

### Niepotwierdzone bezpośrednio w tym audycie

- dokładna konfiguracja po stronie samej aplikacji desktopowej
- aktualny stan cache listy tools po stronie klienta

## 4. Registry / control-plane

### Stan obecny

Projekt ma już dołożony control-plane warstwy registry:

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_plan`

To jest profil:

- read-only,
- connector-safe,
- no-dispatch,
- no-execution,
- plan-only na najwyższym obecnym poziomie.

### Czego jeszcze nie wolno nazywać aktywnym execution layer

- `dispatchRegisteredTool(...)` jako exposed runtime connector path
- write-capable registry execution
- registry mutation
- network-capable registry execution

## 5. Deploy / rollback / perf

Potwierdzone:

- istnieje `deploy.ps1`
- istnieje `rollback.ps1`
- istnieje `perf.ps1`
- istnieje lokalna historia deployów w `.mcp_deploy`
- istnieją backupi deployów w `.mcp_deploy_backup`
- `npm test` obejmuje:
  - deploy scripts
  - rollback
  - perf script
  - registry v1-v6

## 6. Lokalne artefakty, których nie wolno mylić z repo truth

- `.mcp_warzone`
- `.mcp_deploy`
- `.mcp_deploy_backup`
- `.mcp_audit`
- `.mcp_audit.log`
- `.mcp_perf_on`
- `.mcp_perf.log`
- `.mcp_backups`
- `.mcp_index`
- `.mcp_trash`

To są ważne źródła dowodowe dla audytu, ale nie canonical source-of-truth same przez się.

## 7. Najważniejsze ryzyka dokumentacyjne

1. Dokumenty historyczne i bieżące były mieszane w jednym poziomie `docs/`.
2. Nie było jawnego podziału na:
   - current,
   - reference,
   - historical,
   - staging/local-only.
3. Część dokumentów opisywała funkcje "jakby aktywne", mimo że kod potwierdzał tylko częściową integrację.
4. `MCP_INDEX.md` był zbyt agresywnie stylizowany na jedyne źródło prawdy.

## 8. Czytaj dalej

Jeśli potrzebujesz:

- rozszerzonego audytu findings + recommendations: `AUDIT_2026-05-03_DEEP.md`
- zgodności z OpenAI MCP / Apps: `OPENAI_MCP_CONFORMANCE_2026-05-03.md`
- pełnego audytu: `AUDIT_2026-05-03.md`
- klasyfikacji wszystkich dokumentów: `DOCS_CATALOG.md`
- procedur operatorskich: `MCP_OPERATOR_MANUAL.md`
