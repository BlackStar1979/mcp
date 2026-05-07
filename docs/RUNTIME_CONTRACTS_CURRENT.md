# Runtime Contracts — Current

Data: 2026-05-07
Status: canonical_current
Zakres: aktualne kontrakty i granice odpowiedzialności dla aktywnego runtime `server_tools.js`, bounded web tools (`pypi_info`, `check_npm_package`, `fetch_github_file`), bounded process runner (`run_process`, `process_runner_status`), modelu multi-root z aliasami `@alias/...` oraz bieżący status test boundary po korektach coverage i wdrożeniu `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard`, `change_workflow_simulator` i `tool_usage_snapshot`

## Cel

Ten dokument zastępuje używanie `MCP_TOOL_CONTRACTS.md` jako bieżącego source-of-truth dla aktywnego runtime.

`MCP_TOOL_CONTRACTS.md` pozostaje ważne historycznie i koncepcyjnie, ale zawiera stare elementy workflow i nie może być już czytane samodzielnie jako aktualna instrukcja operacyjna.

## Global rules

1. Runtime truth ma pierwszeństwo nad dokumentem.
2. Sama obecność pliku nie jest wdrożeniem.
3. `.mcp_warzone` jest stagingiem, nie aktywnym runtime.
4. Primary workspace root dla filesystem, index i science to `C:\Work`; dodatkowe rooty mogą być dołączane przez `MCP_EXTRA_ROOTS` i są adresowane jawnie jako `@alias/...`.
5. W środowiskach nie-Windows domyślne rooty są wyprowadzane z checkoutu repo albo z `MCP_WORK_ROOT` / `MCP_RUNTIME_DIR`, ale model aliasów pozostaje identyczny.
6. Runtime, control-plane, docs canonical i logi pozostają w `C:\Work\mcp`, niezależnie od liczby workspace rootów.
7. Zmiany runtime MCP wdraża się przez manifest + deploy/rollback.
8. Zmiany testów i dokumentacji repo nie są automatycznie zmianami runtime MCP.
9. `structuredContent` jest kanałem operacyjnym; `content` jest warstwą prezentacyjną.


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
   - `npm test` PASS `101/101`
5. Live MCP verification confirms:
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



