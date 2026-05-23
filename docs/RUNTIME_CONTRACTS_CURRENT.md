# Runtime Contracts — Current

Data: 2026-05-14
Status: canonical_current
Zakres: aktualne kontrakty i granice odpowiedzialności aktywnego runtime

## Cel

Ten dokument zastępuje używanie `docs/archive/MCP_TOOL_CONTRACTS.md` jako bieżącego source-of-truth dla aktywnego runtime.

`docs/archive/MCP_TOOL_CONTRACTS.md` pozostaje ważne historycznie i koncepcyjnie, ale zawiera stare elementy workflow i nie może być już czytane samodzielnie jako aktualna instrukcja operacyjna.

Ten plik nie jest roadmapą ani podręcznikiem operatorskim.

Do tych ról służą odpowiednio:

- `docs/ROADMAP_REGISTRY_EXECUTION.md`
- `docs/MCP_OPERATOR_MANUAL.md`
- `docs/DOCUMENTATION_GOVERNANCE_SPEC.md`

## Global rules

1. Runtime truth ma pierwszeństwo nad dokumentem.
2. Sama obecność pliku nie jest wdrożeniem.
3. `.mcp_warzone` jest stagingiem, nie aktywnym runtime.
4. Primary workspace root dla filesystem, index i science to `C:\Work`; dodatkowe rooty mogą być dołączane przez `MCP_EXTRA_ROOTS` i są adresowane jawnie jako `@alias/...`.
5. W środowiskach nie-Windows domyślne rooty są wyprowadzane z checkoutu repo albo z `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`, ale model aliasów pozostaje identyczny.
6. Runtime, control-plane, docs canonical i logi pozostają w `C:\Work\mcp`, niezależnie od liczby workspace rootów.
7. Zmiany runtime MCP wdraża się przez manifest + deploy/rollback.
8. Zmiany testów i dokumentacji repo nie są automatycznie zmianami runtime MCP.
9. `server_tools.js --auth access` używa portu `3001` i modelu Cloudflare Access / Codex; origin akceptuje request po obecności `Cf-Access-Jwt-Assertion`.
10. `server_tools.js --auth bearer --token-file <BASE MCP>\.secrets\mcp_token.txt` używa portu `3002`, akceptuje `Authorization: Bearer ...` i zachowuje legacy `?token=...` fallback dla kompatybilności klienta. Dla lokalnego bearer mode istnieje też legacy fallback środowiskowy `MCP_TOKEN`, ale domyślny priorytet środowiskowy pozostaje po stronie `MCP_BEARER_TOKEN`; nie jest to docelowy publiczny model auth. `server_tools_token.js` pozostaje tylko shimem kompatybilnościowym, nie docelowym launcherem.
11. `server_tools.js --auth oauth2` jest zarezerwowany dla portu `3003`, ale nie jest jeszcze zaimplementowany i ma kończyć start jawnie błędem zamiast udawać działanie.
12. `server_tools.js` wspiera startup-time module gating:
    - `--modules <csv>`
    - `--disable-modules <csv>`
    - `MCP_ENABLED_MODULES`
    - `MCP_DISABLED_MODULES`
13. Wyłączone moduły nie są importowane ani rejestrowane w runtime; startup log raportuje `enabled_ids`, `disabled_ids`, `enabled_labels`.
- `server.js` i `server_tools.js` wystawiają bounded status HTTP na:
  - `GET /healthz`
  - `GET /statusz`
  - oba endpointy są zasilane wspólnym providerem `core/observability/runtime_status_provider.js`
- status payload nie może ujawniać sekretów; kontrakt obejmuje tylko bounded pola status/runtime/process/network/modules/observability/health
- top-level `status` musi pozostać spójny z `health.level` (`ok` / `warn` / `degraded`), a `modules.degraded_ids` samo w sobie podnosi status do `degraded`
12. structuredContent jest kanałem operacyjnym; content jest warstwą prezentacyjną.
13. `stc_safe.js` jest osobnym connector-safe profilem na porcie `3010`, używa strict shape `2025-05-strict-v1`, wystawia tylko `search` i `fetch`, nie importuje mutation-capable modułów i używa zwykłego JSON-RPC over HTTP na `POST /mcp`.
14. Publiczny connector-safe host dla ChatGPT Desktop powinien używać hostname bez underscore; w praktyce `mcp_stc_safe...` nie przechodził handshake w Desktop app mimo poprawnych odpowiedzi HTTP, a `mcp-stc-safe...` działa poprawnie.
15. Perf logging w pełnym `server_tools.js` jest centralne i transportowe:
   - każde `server.registerTool(...)` przechodzi przez `timeTool(...)`
   - każdy `POST /mcp` request przechodzi przez `timeRequest(...)`
16. Audit logging nie jest globalnie automatyczne; coverage musi być domknięte na poziomie handlerów tooli albo dedykowanego runtime wrappera.
17. `stc_safe.js` ma własne observability:
   - `.mcp_perf.log` przez `timeTool(...)` i `timeRequest(...)`
   - `.mcp_audit.log` przez:
     - `server_start`
     - `rpc_received`
     - `tool_call_start`
     - `tool_call_end`
     - `tool_call_error`
     - `server_error`
     - oraz pomocnicze:
       - `stc_safe_search`
       - `stc_safe_fetch`
       - `stc_safe_request`
18. `stc_safe.js` nie loguje surowych argumentów `query` i `id`; audit używa hash-only summary i klasyfikujących flag markerów.
19. `stc_safe.js` ma być utrzymywany zgodnie z findings dump z `C:\Work\mcp-tests\MCP_CONNECTOR_FINDINGS_DUMP_2026-05-12_v2.md`; approval/preflight z ChatGPT Desktop, jeśli zatrzyma request przed wysłaniem, jest poza zakresem server-side fixów.


## Aktywny tool surface `server_tools.js`

### Read/search/context

- `index_status`
- `build_index`
- `search_index`
- `search_index_context`
- `collect_context`
- `collect_romionsim_context`

### Filesystem

Adresowanie ścieżek:

- `.` i bare paths -> primary root `C:\Work`
- `@alias/...` -> jawnie wskazany dodatkowy root z `MCP_EXTRA_ROOTS`

- `get_info`
- `list_directory`
- `read_file`
- `read_file_lines`
- `read_file_chunk`
- `write_file`
- `append_file`
- `copy_path`
- `move_path`
- `delete_path`
- `restore_path`

### Science

- `inventory_tree`
- `fits_info`
- `hdf5_info`
- `table_profile`

### Code safe

- `code_symbols`
- `code_dependencies`
- `code_audit`
- `code_impact`

### Registry safe

- `tool_registry_status`
- `tool_registry_list`
- `tool_registry_get_tool`
- `tool_registry_validate_tool`
- `tool_registry_policy`
- `tool_registry_preflight`
- `tool_registry_execute`
- `tool_registry_plan`

### Web tools

- `http_get`
- `pypi_info`
- `check_pypi_package`
- `check_npm_package`
- `fetch_github_file`

### Truth tools

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`
- `change_workflow_simulator`
- `tool_usage_snapshot`

### Process tools

- `run_process`
- `process_runner_status`

### Connector-safe profile `stc_safe.js`

- `search`
- `fetch`

## Critical boundaries

### Registry boundary

- `tool_registry_execute` is simulation-only
- `dispatch_enabled` remains false
- `execution_enabled` remains false
- no registry path may write to project files

### Web boundary

- web tools are allowlisted and bounded
- they are read-only
- they are open-world
- they are not generic browser automation

### Process boundary

- process tools are local-world and bounded
- `run_process` uses an allowlisted bare executable name, not a generic shell
- `run_process` captures bounded stdout/stderr, enforces timeout, and audits start/finish events
- child processes do not inherit the full parent environment; only a small safe inherited key set is forwarded, plus sanitized caller-supplied env
- PowerShell defaults to workspace-local `.ps1` via `-File`; `-EncodedCommand` remains forbidden unless policy is explicitly relaxed outside normal operation

### Recovery boundary

- startup recovery is decoupled from legacy `core/code_tools.js`
- rollback recovery uses `core/recovery_rollback.js`

### Connector-safe boundary

- `stc_safe.js` does not register or import:
  - process tools
  - filesystem mutation tools
  - registry execute surface
  - remote site tools
- connector-safe payloads use:
  - exactly one `content` item
  - `content[0].type === "text"`
  - valid JSON in `content[0].text`
- `search` i `fetch` w `stc_safe.js` deklarują `outputSchema` i zwracają `structuredContent`; JSON w `content[0].text` jest lustrzanym kanałem kompatybilnościowym, nie jedynym kanałem danych
- search results expose only:
  - `id`
  - `title`
  - `url`
- fetch payload exposes only:
  - `id`
  - `title`
  - `text`
  - `url`
  - `metadata`
- `fetch.metadata` w `stc_safe.js` musi zawierać:
  - `source`
  - `kind`
  - `connectorShapeVersion`
  - `truncated`
  - `original_chars`
  - `cap_chars`
- `fetch` w `stc_safe.js` ma domyślny cap `2500` znaków i nie powinien być odpinany, dopóki:
  - search nie jest stabilne
  - fetch neutralny i real-doc nie są stabilne
  - Desktop nie przestanie wykazywać approval/preflight instability
- `strict-v1` in STC-SAFE is intentionally limited to `search` and `fetch`, but this is an engineering isolation choice for this profile, not a definition of strict MCP tools in general
- strictness is a generic tool-contract property (descriptor/schema/annotations/runtime-result/tests) and is not restricted to `search/fetch`
- `stc_safe.js` currently behaves as a stateless connector-safe profile; do not plan server-to-client-dependent features there without revisiting the transport model
- `stc_safe.js` is now expected to produce both:
  - perf entries for MCP request/tool timing
  - audit entries for connector-safe tool invocation paths
- `stc_safe.js` may support diagnostic canary docs, but they should not be mixed into ordinary connector search unless diagnostic mode is explicitly enabled

## Test boundary

Current tests are useful and now closer to active runtime surface.

Confirmed current coverage:

1. `tests/mcp_contract_surface.test.js` includes `registerWebTools` and asserts active web tools:
   - `http_get`
   - `pypi_info`
   - `check_pypi_package`
2. `tests/registry_execute_v1_1.test.js` reads active runtime source:
   - `core/registry_tools_safe.js`
   and the test file itself no longer depends on `.mcp_warzone` artifacts
3. `tests/registry_outputschema_runtime_guard.test.js` covers the active registry rollout set including:
   - `tool_registry_execute`
4. Latest repo validation:
   - `npm test` PASS `181/181`
6. Live MCP verification confirms:
   - `project_truth_audit` is exposed in active runtime
   - `project_truth_audit` returns `status: ok` with `drifts: []`
   - `code_runtime_map` is exposed in active runtime
   - `code_runtime_map` returns `status: ok` with active entrypoints, module map, boundaries, and test links
   - `deploy_decision_guard` is exposed in active runtime
   - `deploy_decision_guard` returns `status: ok` for both repo-only and runtime-with-refresh scenarios
   - `change_workflow_simulator` is exposed in active runtime
   - `change_workflow_simulator` returns `status: ok` for both repo-only and runtime-with-refresh simulations
   - `tool_usage_snapshot` is exposed in active runtime
   - `tool_usage_snapshot()` returns `status: ok`
   - `process_runner_status` is exposed in active runtime and returns `status: ok` with `inherits_full_parent_env: false`
   - `run_process` is exposed in active runtime and returns `status: ok` for `command=node`, `args=[--version]`, `cwd=mcp`
   - both `3001` (`--auth access`) and `3002` (`--auth bearer --token-file ...`) return the same MCP protocol version `2025-03-26`, the same `text/event-stream` transport, the same tool count (`55` during audit), and non-empty results for `project_truth_audit` and `search_index`
   - `stc_safe.js --self-test` returns `self-test ok (2025-05-strict-v1)`
   - `tests/stc_safe_contract.test.js` verifies strict connector-safe shape, version exposure, and absence of mutation-capable tools
   - raw `POST http://127.0.0.1:3010/mcp` verification confirms:
     - `tools/list` returns only `search` and `fetch`
     - `search("Cloudflare Access")` returns non-empty `structuredContent.results[]` and JSON mirror in `content[0].text`
     - `fetch("docs/runtime_contracts_current")` returns non-empty `structuredContent`, JSON mirror, and expected truncation metadata
   - publiczny `https://mcp-stc-safe.romionologic.dev/mcp` przechodzi `initialize` z `200`
   - ChatGPT Desktop potwierdził poprawny handshake i widoczność `search` / `fetch` dla `https://mcp-stc-safe.romionologic.dev/mcp`
   - publiczny `POST https://modular-mcp.romionologic.dev/mcp` za Cloudflare Access `SERVICE AUTH` przechodzi `initialize` z `200` przy poprawnym `Accept: application/json, text/event-stream`
   - `pypi_info` is exposed in active runtime
   - `pypi_info("zod")` returns `status: ok`
   - `check_pypi_package("zod")` returns `status: ok`
   - `check_npm_package("is-number")` returns `status: ok`
   - `check_npm_package("zod")` returns `status: ok`
   - `fetch_github_file("colinhacks/zod", "main", "package.json")` returns `status: ok`
   - `http_get("https://pypi.org/pypi/zod/json")` returns `status: ok`
   - full registry control-plane was manually invoked through active MCP on 2026-05-05:
     - `tool_registry_status`
     - `tool_registry_list`
     - `tool_registry_get_tool`
     - `tool_registry_validate_tool`
     - `tool_registry_policy`
     - `tool_registry_preflight`
     - `tool_registry_plan`
     - `tool_registry_execute`

### Truth audit boundary

- `project_truth_audit` is an exposed MCP tool but not a logical registry entry under `tool_registry_get_tool`
- this is expected in the current architecture:
  - registry describes registered logical tools such as `code_analysis`
  - `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard`, `change_workflow_simulator`, and `tool_usage_snapshot` are direct MCP runtime tools for drift detection, runtime orientation, workflow classification, operator-step simulation, and observed usage monitoring
- `run_process` and `process_runner_status` are direct MCP runtime tools for bounded local process execution and policy/status inspection; they are not part of registry simulation-only execution

Therefore:

- passing tests remains necessary
- passing tests is still not a substitute for runtime invocation after runtime MCP changes
- runtime verification after deploy remains mandatory for changes to handlers, descriptors, schemas, tool surface, or connector-facing behavior


### CI portability rules (closed regressions from 2026-05-06)

1. Runtime-local file reads in helper tools must use platform-safe joins, not manual `\\` concatenation.
2. Default workspace/runtime roots must be host-aware:
   - Windows local runtime may default to `C:\Work` / `C:\Work\mcp`
   - non-Windows CI must derive defaults from checkout or explicit `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`
3. Tests for config and path policy must validate semantics, not assume Windows-only absolute paths.
4. Observability helpers such as `tool_usage_snapshot` must tolerate missing local artifacts like `.mcp_perf.log` and degrade to explicit empty snapshots instead of failing CI.
5. A green local `npm test` after root-model changes is necessary but not sufficient; portability assumptions must be reviewed explicitly when code touches paths, logs, or host defaults.
6. Logging coverage is part of runtime correctness:
   - if a new active tool group or runtime bypasses `.mcp_perf.log` or `.mcp_audit.log`, it should be treated as an observability regression
7. Descriptor/contract checks are not sufficient for schema-surface changes:
   - a tool may still fail at real MCP bootstrap if final `inputSchema` is not an SDK-accepted schema object
   - using `SomeSchema.shape` directly as final `inputSchema` is not treated as a safe registration pattern
   - `.shape` is acceptable only as intermediate material used to build a final `z.object(...)` / `extend(...)` result
8. `tests/server_bootstrap_runtime.test.js` is a required guardrail for:
   - tool registration changes
   - `inputSchema` / `outputSchema` changes
   - runtime bootstrap sequence changes
   because it instantiates a real `McpServer` and executes production registration functions instead of only validating descriptors statically
9. `tests/server_tools_mcp_transport_contract.test.js` is a required static guardrail for the full `server_tools.js` transport edge:
   - `Accept` must remain present in the `/mcp` CORS allow-list
   - the runtime path must continue using `StreamableHTTPServerTransport`

### Desktop connector learnings

1. A public MCP server may answer correctly over HTTP and still fail Desktop connector creation for host-name-level reasons.
2. `outputSchema + structuredContent + JSON mirror in content[0].text` is accepted by ChatGPT Desktop for connector-style `search` / `fetch`.
3. Some sensitive-looking tool arguments may be blocked upstream by approval/preflight before they reach MCP; in such cases the server cannot validate, sanitize, reject, log, or return a controlled error because the request never arrives.
4. Do not use payload smuggling or encoded phrases to bypass approval/preflight during diagnostics.
5. Mutation-capable MCP tools are currently an unreliable Desktop workflow for this project; use Desktop primarily for read-only diagnostics, connector validation, and bounded context extraction.
6. For descriptor/tool-surface changes at the same public MCP URL, prefer:
   - restart server
   - refresh tools in ChatGPT Desktop
   before deleting/recreating the connector.
7. `code_sample_js` belongs to the safe read-only testing/diagnostic family, not to the mutation/execution family.
8. Full `server_tools.js` MCP over `POST /mcp` currently enforces streamable-HTTP content negotiation:
   - requests must accept both `application/json` and `text/event-stream`
   - a request missing this `Accept` contract is rejected with `Not Acceptable`
   - malformed JSON request bodies are rejected with bounded `HTTP 400` / JSON-RPC parse error instead of leaking raw parser stack traces to runtime stderr
2. For connector-safe diagnostics, compare:
   - raw `GET /healthz`
   - raw `POST /mcp initialize`
   - Desktop connector creation
   rather than assuming a Desktop failure means the MCP server is malformed.
3. Minimal connector-safe surface is currently the most reliable Desktop diagnostic baseline:
   - `search`
   - `fetch`
4. Do not infer from current evidence that Desktop formally requires exactly two tools; what is confirmed is that strict shape plus minimal surface is stable.
5. Direct file mutation and process execution from Desktop should be treated as operationally unsupported for now, even if equivalent tools exist in the MCP runtime.

### OutputSchema rollout status

Confirmed after the first two staged rollout slices, the full filesystem rollout, and the remote site rollout:

- active `server_tools.js` surface still contains `55` tools
- missing `outputSchema` count is now `0`
- the following groups now expose `outputSchema`:
  - all `index` tools
  - all `science` tools
  - all `code_tools_safe` tools
  - filesystem read/info:
    - `get_info`
    - `list_directory`
  - filesystem mutation:
    - `write_file`
    - `append_file`
    - `copy_path`
    - `move_path`
    - `delete_path`
    - `restore_path`
    - `edit_file_patch`
  - remote site read/mutation tools:
    - `list_remote_site_files`
    - `read_remote_site_file`
    - `write_remote_site_file`
    - `edit_remote_site_file`
    - `move_remote_site_file`
    - `delete_remote_site_file`
    - `restore_remote_site_file`

Rule for next slices:

- advance one tool family at a time
- update contract tests in the same slice
- rerun full `npm test`
- sync canonical state docs if coverage assumptions change

### Code graph and patch semantics

Confirmed current runtime behavior:

- dependency graph analysis in `core/code/shared_runtime.js` resolves local JavaScript/TypeScript `import ... from` edges and local literal CommonJS `require("...")` edges
- commented-out or stringified `require(...)` text must not create dependency edges or unresolved imports
- `edit_file_patch` anchor matching is normalized across `CRLF` / `LF` / `CR`
- `edit_file_patch` rewrites inserted/replacement content using the dominant line-ending style detected in the target file
- `edit_file_patch` still requires exactly one anchor match after normalization and must reject ambiguous normalized matches

### Remote site config reference rule

Confirmed current runtime rule:

- `remote_site_*` tools require explicit `vps_config_ref`
- there is not yet a canonical default config path architecture for VPS access config
- current operator-known working config ref is:
  - `www/remote-site-tools-config.json`
- `C:\Work\www\remote-site-tools-config.json` should be treated as an explicit operational dependency for live remote-site testing, not a path to be inferred implicitly

### SDK-derived auth and transport learnings

1. Both TypeScript SDK and Python SDK explicitly support stateless HTTP server patterns for simple remote MCP servers.
2. Python SDK examples and tests confirm that stateless mode does not support server-to-client request flows such as:
   - root listing
   - sampling
   - elicitation
3. Future `oauth2` work should expect a separate protected-resource/auth layer, not an ad-hoc token check mixed into tool handlers.
4. Protected resource metadata should be treated as a first-class requirement candidate for future `oauth2`, especially for `/mcp` path-based resources.
5. For future bearer/OAuth modes, model error handling should distinguish:
   - `401 invalid_token`
   - `403 insufficient_scope`
   rather than collapsing all auth failures into one generic response.
## Deployment boundary

Correct production path for runtime MCP changes:

1. stage file in `.mcp_warzone`
2. create manifest in `.mcp_deploy`
3. verify staging file and manifest exist
4. `deploy.ps1 -Mode Prepare`
5. `deploy.ps1 -Mode Execute`
6. restart MCP
7. refresh connector if tool surface, schema, descriptor metadata, or connector metadata changed
8. invoke changed tools directly
9. rollback if result is wrong

Repo-only docs changes do not require runtime deploy, restart, or reconnect.

Test/supporting repo changes require staging validation and repo validation, but do not require runtime deploy unless they modify active runtime files.

Direct copy into active runtime code is forbidden for runtime MCP changes.







