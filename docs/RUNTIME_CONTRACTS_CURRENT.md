# Runtime Contracts — Current

Data: 2026-05-05
Status: canonical_current
Zakres: aktualne kontrakty i granice odpowiedzialności dla aktywnego runtime `server_tools.js` oraz bieżący status test boundary po korektach coverage i wdrożeniu `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard` oraz `change_workflow_simulator`

## Cel

Ten dokument zastępuje używanie `MCP_TOOL_CONTRACTS.md` jako bieżącego source-of-truth dla aktywnego runtime.

`MCP_TOOL_CONTRACTS.md` pozostaje ważne historycznie i koncepcyjnie, ale zawiera stare elementy workflow i nie może być już czytane samodzielnie jako aktualna instrukcja operacyjna.

## Global rules

1. Runtime truth ma pierwszeństwo nad dokumentem.
2. Sama obecność pliku nie jest wdrożeniem.
3. `.mcp_warzone` jest stagingiem, nie aktywnym runtime.
4. Zmiany runtime MCP wdraża się przez manifest + deploy/rollback.
5. Zmiany testów i dokumentacji repo nie są automatycznie zmianami runtime MCP.
6. `structuredContent` jest kanałem operacyjnym; `content` jest warstwą prezentacyjną.

## Aktywny tool surface `server_tools.js`

### Read/search/context

- `index_status`
- `build_index`
- `search_index`
- `search_index_context`
- `collect_context`
- `collect_romionsim_context`

### Filesystem

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
- `check_pypi_package`

### Truth tools

- `project_truth_audit`
- `code_runtime_map`
- `deploy_decision_guard`
- `change_workflow_simulator`

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

### Recovery boundary

- startup recovery is decoupled from legacy `core/code_tools.js`
- rollback recovery uses `core/recovery_rollback.js`

## Test boundary

Current tests are useful and now closer to active runtime surface.

Confirmed current coverage:

1. `tests/mcp_contract_surface.test.js` includes `registerWebTools` and asserts active web tools:
   - `http_get`
   - `check_pypi_package`
2. `tests/registry_execute_v1_1.test.js` reads active runtime source:
   - `core/registry_tools_safe.js`
   and the test file itself no longer depends on `.mcp_warzone` artifacts
3. `tests/registry_outputschema_runtime_guard.test.js` covers the active registry rollout set including:
   - `tool_registry_execute`
4. Latest repo validation:
   - `npm test` PASS `82/82`
5. Live MCP verification confirms:
   - `project_truth_audit` is exposed in active runtime
   - `project_truth_audit` returns `status: ok` with `drifts: []`
   - `code_runtime_map` is exposed in active runtime
   - `code_runtime_map` returns `status: ok` with active entrypoints, module map, boundaries, and test links
   - `deploy_decision_guard` is exposed in active runtime
   - `deploy_decision_guard` returns `status: ok` for both repo-only and runtime-with-refresh scenarios
   - `change_workflow_simulator` is exposed in active runtime
   - `change_workflow_simulator` returns `status: ok` for both repo-only and runtime-with-refresh simulations
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
  - `project_truth_audit`, `code_runtime_map`, `deploy_decision_guard`, and `change_workflow_simulator` are direct MCP runtime tools for drift detection, runtime orientation, workflow classification, and operator-step simulation

Therefore:

- passing tests remains necessary
- passing tests is still not a substitute for runtime invocation after runtime MCP changes
- runtime verification after deploy remains mandatory for changes to handlers, descriptors, schemas, tool surface, or connector-facing behavior

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
