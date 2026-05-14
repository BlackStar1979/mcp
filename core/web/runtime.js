import { z } from "zod";

export const READ_ONLY_OPEN_WORLD = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const ALLOWED_HOSTS = new Set(["pypi.org", "registry.npmjs.org", "raw.githubusercontent.com"]);
export const HTTP_TIMEOUT_MS = 10000;
export const MAX_RESPONSE_BYTES = 256000;
export const MAX_TEXT_CHARS = 20000;

export const URL_SCHEMA = z.string().url().max(2048);
export const PACKAGE_NAME_SCHEMA = z.string().min(1).max(214).regex(/^[A-Za-z0-9_.@\/-]+$/);
export const GITHUB_SEGMENT_SCHEMA = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.-]+$/);
export const GITHUB_REF_SCHEMA = z.string().min(1).max(200).regex(/^[A-Za-z0-9._\/-]+$/);
export const GITHUB_PATH_SCHEMA = z.string().min(1).max(2000).refine((value) => {
  if (value.startsWith("/")) return false;
  if (value.includes("..")) return false;
  return true;
}, "github_path_must_be_relative_without_dotdot");

export const HTTP_GET_OUTPUT = z.object({
  status: z.string(),
  url: z.string(),
  host: z.string(),
  http_status: z.number(),
  content_type: z.string().optional(),
  bytes: z.number(),
  truncated: z.boolean(),
  text: z.string().optional(),
}).strict();

export const PYPI_PACKAGE_OUTPUT = z.object({
  status: z.string(),
  package: z.string(),
  url: z.string(),
  http_status: z.number(),
  found: z.boolean(),
  name: z.string().optional(),
  version: z.string().optional(),
  summary: z.string().optional(),
  project_url: z.string().optional(),
  package_url: z.string().optional(),
  requires_python: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  vulnerabilities_count: z.number().optional(),
}).strict();

export const NPM_PACKAGE_OUTPUT = z.object({
  status: z.string(),
  package: z.string(),
  url: z.string(),
  http_status: z.number(),
  found: z.boolean(),
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().nullable().optional(),
  repository_url: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
}).strict();

export const GITHUB_FILE_OUTPUT = z.object({
  status: z.string(),
  owner: z.string(),
  repo: z.string(),
  ref: z.string(),
  path: z.string(),
  url: z.string(),
  http_status: z.number(),
  found: z.boolean(),
  content_type: z.string().optional(),
  bytes: z.number().optional(),
  truncated: z.boolean().optional(),
  text: z.string().optional(),
}).strict();

export function packageInfoDescription(registryName) {
  return `Return bounded metadata for one ${registryName} package using the official JSON API. Read-only.`;
}

export function assertAllowedUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("only_https_urls_allowed");
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`host_not_allowed: ${url.hostname}`);
  url.username = "";
  url.password = "";
  return url;
}

export async function boundedFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "user-agent": "mcp-web-tools/1.0 read-only",
      },
    });

    const contentType = response.headers.get("content-type") || undefined;
    const arrayBuffer = await response.arrayBuffer();
    const bytes = arrayBuffer.byteLength;
    const truncated = bytes > MAX_RESPONSE_BYTES;
    const slice = truncated ? arrayBuffer.slice(0, MAX_RESPONSE_BYTES) : arrayBuffer;
    const fullText = new TextDecoder().decode(slice);
    const text = fullText.slice(0, MAX_TEXT_CHARS);

    return { response, contentType, bytes, truncated, fullText, text };
  } finally {
    clearTimeout(timer);
  }
}
