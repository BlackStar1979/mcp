import { resolveToolRuntime } from "./registry.js";
import { validateDslInput, validateOutput } from "./dsl_validator.js";
import { appendTraceStep, createTrace, finalizeTrace } from "../observability/trace.js";

function normalizeCodeAnalysisArgs(input) {
  const limits = input.limits || {};
  const base = {
    path: input.scope,
    recursive: limits.recursive ?? true,
    max_files: limits.max_files ?? 500,
    max_depth: limits.max_depth ?? 5,
    direction: limits.direction ?? "both",
  };

  if (input.target !== undefined) base.target = input.target;
  if (input.anchor !== undefined) base.anchor = input.anchor;
  if (input.content !== undefined) base.content = input.content;
  if (input.mode !== undefined) base.mode = input.mode;
  if (input.commit_ref !== undefined) base.commit_ref = input.commit_ref;
  if (input.intent !== undefined) base.intent = input.intent;
  if (input.objective !== undefined) base.objective = input.objective;
  if (input.change_type !== undefined) base.change_type = input.change_type;

  return base;
}

function scrubRuntime(runtime) {
  return {
    tool: runtime.tool,
    runtime: runtime.runtime,
    limits: runtime.limits,
    policy: runtime.policy,
    sandbox: runtime.sandbox,
    rag: runtime.rag,
  };
}

export async function dispatchRegisteredTool({ tool, input, handlers, trace_id = null }) {
  const traceId = trace_id || await createTrace({ type: "tool_dispatch", source: "registry", data: { tool, operation: input?.operation } });
  await appendTraceStep(traceId, "dispatch_start", { tool, input });

  try {
    const runtime = await resolveToolRuntime(tool);
    await appendTraceStep(traceId, "dispatch_runtime_resolved", scrubRuntime(runtime));

    const inputValidation = await validateDslInput(runtime.dsl_schema_path, input);
    await appendTraceStep(traceId, "dispatch_input_validated", inputValidation);

    if (tool === "code_analysis") {
      const args = normalizeCodeAnalysisArgs(input);
      const op = input.operation;
      const handler = handlers?.code_analysis?.[op];
      if (!handler) throw new Error("unsupported code_analysis operation: " + op);

      await appendTraceStep(traceId, "dispatch_handler_selected", { tool, operation: op, normalized_args: args });
      const raw = await handler(args, runtime, traceId);
      const wrapped = { status: "ok", result: raw };
      const outputValidation = await validateOutput(runtime.output_schema_path, wrapped);
      await appendTraceStep(traceId, "dispatch_output_validated", outputValidation);

      const result = {
        status: "ok",
        trace_id: traceId,
        tool,
        operation: op,
        runtime,
        input_validation: inputValidation,
        output_validation: outputValidation,
        result: raw,
      };
      await appendTraceStep(traceId, "dispatch_complete", { status: "ok", tool, operation: op });
      await finalizeTrace(traceId, "ok", { tool, operation: op });
      return result;
    }

    throw new Error("unsupported registered tool: " + tool);
  } catch (err) {
    await appendTraceStep(traceId, "dispatch_error", { message: err?.message || String(err) });
    await finalizeTrace(traceId, "error", { message: err?.message || String(err) });
    throw err;
  }
}
