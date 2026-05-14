import { z } from "zod";

import { audit } from "../audit.js";
import { registerSafeTool } from "../responses.js";
import {
  READ_ONLY_OPEN_WORLD,
  GITHUB_SEGMENT_SCHEMA,
  GITHUB_REF_SCHEMA,
  GITHUB_PATH_SCHEMA,
  GITHUB_FILE_OUTPUT,
  assertAllowedUrl,
  boundedFetch,
} from "./runtime.js";

export function registerWebGithubTools(server) {
  registerSafeTool(server, "fetch_github_file", {
    title: "Fetch GitHub file",
    description: "Fetch one bounded raw text file from a public GitHub repository via raw.githubusercontent.com. Read-only, no auth, no disk writes.",
    inputSchema: z.object({
      owner: GITHUB_SEGMENT_SCHEMA,
      repo: GITHUB_SEGMENT_SCHEMA,
      ref: GITHUB_REF_SCHEMA,
      path: GITHUB_PATH_SCHEMA,
    }).strict(),
    outputSchema: GITHUB_FILE_OUTPUT,
    annotations: READ_ONLY_OPEN_WORLD,
  }, async ({ owner, repo, ref, path }) => {
    const safeUrl = assertAllowedUrl(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`);
    const result = await boundedFetch(safeUrl);

    await audit("fetch_github_file", {
      source: "web_tools_v1e",
      event: "fetch_github_file",
      owner,
      repo,
      ref,
      path,
      http_status: result.response.status,
      bytes: result.bytes,
      truncated: result.truncated,
    });

    if (result.response.status === 404) {
      return { status: "not_found", owner, repo, ref, path, url: safeUrl.toString(), http_status: 404, found: false };
    }

    if (!result.response.ok) {
      return { status: "http_error", owner, repo, ref, path, url: safeUrl.toString(), http_status: result.response.status, found: false };
    }

    return {
      status: "ok",
      owner,
      repo,
      ref,
      path,
      url: safeUrl.toString(),
      http_status: result.response.status,
      found: true,
      content_type: result.contentType,
      bytes: result.bytes,
      truncated: result.truncated,
      text: result.text,
    };
  });
}
