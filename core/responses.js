// STEP 4 — structuredContent-first helpers (safe refactor)

export function ok(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

// canonical helper for IO/text payloads
export function textOk(text, structuredContent = {}) {
  const payload = {
    ...(structuredContent || {}),
    // enforce RULE-IO-001 → text MUST exist in structuredContent
    ...(text !== undefined ? { text: String(text) } : {}),
  };

  return {
    content: [{ type: "text", text: String(text ?? "") }],
    structuredContent: payload,
  };
}

export function fail(message, details = {}) {
  const payload = {
    status: "error",
    message: String(message),
    details,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

// wrapper enforcing structuredContent-first discipline
export function registerSafeTool(server, name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      const result = await handler(args || {});

      // already MCP-shaped
      if (result && result.content) return result;

      // plain object → normalize
      return ok(result);
    } catch (e) {
      return fail(e?.message || String(e), { tool: name });
    }
  });
}
