import { z } from "zod";

import { registerSafeTool } from "./responses.js";
import { audit } from "./audit.js";

const READ_ONLY_OPEN_WORLD = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const ALLOWED_HOSTS = new Set(["pypi.org", "registry.npmjs.org", "raw.githubusercontent.com"]);
const HTTP_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 256000;
const MAX_TEXT_CHARS = 20000;

const URL_SCHEMA = z.string().url().max(2048);
const PACKAGE_NAME_SCHEMA = z.string().min(1).max(214).regex(/^[A-Za-z0-9_.@\/-]+$/);
const GITHUB_SEGMENT_SCHEMA = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.-]+$/);
const GITHUB_REF_SCHEMA = z.string().min(1).max(200).regex(/^[A-Za-z0-9._\/-]+$/);
const GITHUB_PATH_SCHEMA = z.string().min(1).max(2000).refine((value) => {
  if (value.startsWith("/")) return false;
  if (value.includes("..")) return false;
  return true;
}, "github_path_must_be_relative_without_dotdot");

const HTTP_GET_OUTPUT = z.object({
  status: z.string(),
  url: z.string(),
  host: z.string(),
  http_status: z.number(),
  content_type: z.string().optional(),
  bytes: z.number(),
  truncated: z.boolean(),
  text: z.string().optional(),
}).strict();

const PYPI_PACKAGE_OUTPUT = z.object({
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

const NPM_PACKAGE_OUTPUT = z.object({
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

const GITHUB_FILE_OUTPUT = z.object({
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

function packageInfoDescription(registryName) {
  return `Return bounded metadata for one ${registryName} package using the official JSON API. Read-only.`;
}

function assertAllowedUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("only_https_urls_allowed");
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`host_not_allowed: ${url.hostname}`);
  url.username = "";
  url.password = "";
  return url;
}

async function boundedFetch(url) {
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

export function registerWebTools(server) {
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

  const pypiPackageHandler = async ({ package: packageName }) => {
    const safeUrl = assertAllowedUrl(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
    const result = await boundedFetch(safeUrl);

    await audit("check_pypi_package", {
      source: "web_tools_v1c",
      event: "check_pypi_package",
      package: packageName,
      http_status: result.response.status,
      bytes: result.bytes,
      truncated: result.truncated,
    });

    if (result.response.status === 404) {
      return { status: "not_found", package: packageName, url: safeUrl.toString(), http_status: 404, found: false };
    }

    if (!result.response.ok) {
      return { status: "http_error", package: packageName, url: safeUrl.toString(), http_status: result.response.status, found: false };
    }

    if (result.truncated) {
      return { status: "payload_too_large", package: packageName, url: safeUrl.toString(), http_status: result.response.status, found: false };
    }

    const parsed = JSON.parse(result.fullText);
    const info = parsed.info || {};
    const vulnerabilities = Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [];

    return {
      status: "ok",
      package: packageName,
      url: safeUrl.toString(),
      http_status: result.response.status,
      found: true,
      name: String(info.name || packageName),
      version: String(info.version || ""),
      summary: info.summary ? String(info.summary).slice(0, 1000) : undefined,
      project_url: info.project_url ? String(info.project_url) : undefined,
      package_url: info.package_url ? String(info.package_url) : undefined,
      requires_python: info.requires_python ?? null,
      license: info.license ?? null,
      vulnerabilities_count: vulnerabilities.length,
    };
  };

  registerSafeTool(server, "pypi_info", {
    title: "PyPI package info",
    description: packageInfoDescription("PyPI"),
    inputSchema: z.object({ package: PACKAGE_NAME_SCHEMA }).strict(),
    outputSchema: PYPI_PACKAGE_OUTPUT,
    annotations: READ_ONLY_OPEN_WORLD,
  }, pypiPackageHandler);

  registerSafeTool(server, "check_pypi_package", {
    title: "Check PyPI package",
    description: packageInfoDescription("PyPI"),
    inputSchema: z.object({ package: PACKAGE_NAME_SCHEMA }).strict(),
    outputSchema: PYPI_PACKAGE_OUTPUT,
    annotations: READ_ONLY_OPEN_WORLD,
  }, pypiPackageHandler);

  registerSafeTool(server, "check_npm_package", {
    title: "Check npm package",
    description: packageInfoDescription("npm"),
    inputSchema: z.object({ package: PACKAGE_NAME_SCHEMA }).strict(),
    outputSchema: NPM_PACKAGE_OUTPUT,
    annotations: READ_ONLY_OPEN_WORLD,
  }, async ({ package: packageName }) => {
    const safeUrl = assertAllowedUrl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
    const result = await boundedFetch(safeUrl);

    await audit("check_npm_package", {
      source: "web_tools_v1d",
      event: "check_npm_package",
      package: packageName,
      http_status: result.response.status,
      bytes: result.bytes,
      truncated: result.truncated,
    });

    if (result.response.status === 404) {
      return { status: "not_found", package: packageName, url: safeUrl.toString(), http_status: 404, found: false };
    }

    if (!result.response.ok) {
      return { status: "http_error", package: packageName, url: safeUrl.toString(), http_status: result.response.status, found: false };
    }

    if (result.truncated) {
      return { status: "payload_too_large", package: packageName, url: safeUrl.toString(), http_status: result.response.status, found: false };
    }

    const parsed = JSON.parse(result.fullText);

    const repositoryUrl = typeof parsed?.repository === "string"
      ? parsed.repository
      : typeof parsed?.repository?.url === "string"
        ? parsed.repository.url
        : null;

    return {
      status: "ok",
      package: packageName,
      url: safeUrl.toString(),
      http_status: result.response.status,
      found: true,
      name: String(parsed?.name || packageName),
      version: parsed?.version ? String(parsed.version) : undefined,
      description: parsed?.description ? String(parsed.description).slice(0, 1000) : undefined,
      homepage: parsed?.homepage ? String(parsed.homepage) : null,
      repository_url: repositoryUrl,
      license: parsed?.license ? String(parsed.license) : null,
    };
  });

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
