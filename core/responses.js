function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function summarizeStructuredSuccess(data) {
  if (typeof data === "string") return data;
  if (typeof data === "number" || typeof data === "boolean") return `OK: ${String(data)}`;
  if (data == null) return "OK.";

  if (Array.isArray(data)) {
    return `OK. Returned ${data.length} ${pluralize(data.length, "item")}.`;
  }

  if (typeof data === "object") {
    if (typeof data.text === "string" && Object.keys(data).length === 1) {
      return data.text;
    }

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }

    if (typeof data.status === "string" && data.status.trim()) {
      return `Status: ${data.status}.`;
    }

    const keys = Object.keys(data);
    if (keys.length === 0) return "OK.";
    return `OK. structuredContent exposes ${keys.length} ${pluralize(keys.length, "field")}.`;
  }

  return "OK.";
}

export function ok(data) {
  return {
    // OpenAI-oriented full MCP contract: structuredContent is the machine channel;
    // content stays concise unless a tool explicitly opts into text mirroring.
    content: [{ type: "text", text: summarizeStructuredSuccess(data) }],
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
    content: [{ type: "text", text: String(message) }],
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
