import { z } from "zod";

import { audit } from "../audit.js";
import { registerSafeTool } from "../responses.js";
import {
  READ_ONLY_OPEN_WORLD,
  URL_SCHEMA,
  HTTP_GET_OUTPUT,
  assertAllowedUrl,
  boundedFetch,
} from "./runtime.js";

export function registerWebHttpTools(server) {
  registerSafeTool(server, "http_get", {
    title: "HTTP GET (allowlisted)",
    description: "Fetch a bounded HTTPS URL from an allowlist. Read-only, no auth, no cookies, no disk writes.",
    inputSchema: z.object({ url: URL_SCHEMA }).strict(),
    outputSchema: HTTP_GET_OUTPUT,
    annotations: READ_ONLY_OPEN_WORLD,
  }, async ({ url }) => {
    const safeUrl = assertAllowedUrl(url);
    const result = await boundedFetch(safeUrl);

    await audit("http_get", {
      source: "web_tools_v1c",
      event: "http_get",
      host: safeUrl.hostname,
      path: safeUrl.pathname,
      http_status: result.response.status,
      bytes: result.bytes,
      truncated: result.truncated,
    });

    return {
      status: "ok",
      url: safeUrl.toString(),
      host: safeUrl.hostname,
      http_status: result.response.status,
      content_type: result.contentType,
      bytes: result.bytes,
      truncated: result.truncated,
      text: result.text,
    };
  });
}
