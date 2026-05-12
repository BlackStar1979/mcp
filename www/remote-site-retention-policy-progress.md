
## Incident: MCP bootstrap failure caused by invalid inputSchema shape

Date: 2026-05-10

### Symptom
ChatGPT MCP connector creation failed with runtime bootstrap error:

```
Error: inputSchema must be a Zod schema or raw shape, received an unrecognized object
```

Failure occurred during `registerRemoteSiteTools(server)` execution inside runtime server bootstrap.

### Root Cause
A tool registration used:

```js
inputSchema: CONFIG_REF_INPUT.shape
```

This produced a raw internal shape object in a context where MCP SDK expected either:
- a full `z.object(...)`
- or a valid raw-shape structure accepted directly by SDK.

The deployed object was not accepted by SDK runtime validation.

### Important Nuance
This pattern IS valid:

```js
toolBaseInput({ ...REL_PATH_INPUT.shape })
```

because `.shape` is only used as input to `extend(...)`, producing a final valid `ZodObject`.

The invalid pattern was using `.shape` directly as final `inputSchema`.

### Why Existing Tests Missed It
The previous test suite validated descriptors and contracts but did NOT execute a real full runtime registration/bootstrap sequence.

Therefore:
- syntax passed,
- descriptor tests passed,
- runtime registration failed only during actual MCP bootstrap.

### Guardrail Added
New runtime bootstrap test:

`tests/server_bootstrap_runtime.test.js`

This test now:
- creates a real `McpServer`,
- executes all production registration functions,
- fails immediately on invalid `inputSchema` or registration-time SDK errors.

This test must pass before any future deploy touching tool registration or schema surfaces.
