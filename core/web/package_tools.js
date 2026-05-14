import { z } from "zod";

import { audit } from "../audit.js";
import { registerSafeTool } from "../responses.js";
import {
  READ_ONLY_OPEN_WORLD,
  PACKAGE_NAME_SCHEMA,
  PYPI_PACKAGE_OUTPUT,
  NPM_PACKAGE_OUTPUT,
  packageInfoDescription,
  assertAllowedUrl,
  boundedFetch,
} from "./runtime.js";

export function registerWebPackageTools(server) {
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
}
