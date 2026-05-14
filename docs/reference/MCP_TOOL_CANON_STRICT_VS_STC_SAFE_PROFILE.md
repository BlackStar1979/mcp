# MCP Tool Canon — Strict Tool Contract vs STC-SAFE Profile

Data: 2026-05-14  
Status: current_reference

## Purpose

This canon corrects the misinterpretation that `search` and `fetch` are the only strict MCP tools.

They are not.

`search` and `fetch` were selected first for STC-SAFE because they are a minimal, useful, read-only connector flow and validate two different response shapes. This is an operational profile decision, not a global MCP strictness rule.

## Core distinction

### Strict Tool Contract

A strict tool is any MCP tool whose descriptor and handler are fully aligned.

A strict tool has:

- stable tool name,
- precise title and description,
- precise `inputSchema`,
- `outputSchema` when returning structured data,
- `structuredContent` when `outputSchema` exists,
- `content[0].text` as JSON mirror when JSON compatibility is used,
- annotations matching real behavior,
- bounded output,
- deterministic response shape,
- descriptor/runtime self-tests.

This definition is generic and applies to any tool family.

### STC-SAFE Profile

STC-SAFE is a connector-facing restricted profile chosen for current client-risk conditions.

Current STC-SAFE surface:

- `search`
- `fetch`

This is a safety boundary for current ChatGPT connector behavior, not a protocol limit.

## Correct canon rule

Use this rule:

> Any MCP tool can be strict if its descriptor, schema, annotations, runtime result, bounds, and tests form a coherent contract.

And separately:

> STC-SAFE currently exposes only `search` and `fetch` as a minimal read-only connector-safe profile.

These statements are not equivalent and must not be conflated.

## Operational policy

Before adding a tool to STC-SAFE, decide separately:

1. Is the tool strict?
2. Is the tool safe for the current connector profile?

A tool may pass (1) and fail (2).

## Regression guard for future edits

Forbidden inference:

- “strict MCP means only `search/fetch`”

Required phrasing:

- “strictness is a contract property of any tool”
- “STC-SAFE membership is an operational profile decision”

## Project-local evidence (already true in this repo)

Strict non-`search`/`fetch` tools already exist, for example:

- filesystem read tools (`get_info`, `list_directory`, `read_file*`) with schemas and read-only annotations,
- registry tools with `outputSchema` guarded by runtime tests,
- process/truth/web families with explicit descriptor and output contracts.

Therefore `search/fetch` cannot be the definition of strictness in this project.

## Final conclusion

`search` and `fetch` are not the only strict MCP tools.

They are the current minimal STC-SAFE profile.

Strictness is a generic contract property.  
STC-SAFE profile membership is a separate operational safety decision.

