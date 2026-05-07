import { ACCESS_SECRET } from "./config.js";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

export function hasCloudflareAccessAssertion(req) {
  const value = req?.headers?.[ACCESS_JWT_HEADER];
  return typeof value === "string" && value.trim().length > 0;
}

export function extractBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.["authorization"] || "";
  const parts = String(header).split(/\s+/);
  return parts.length === 2 && parts[0].toLowerCase() === "bearer"
    ? parts[1]
    : null;
}

export function isAuthorizedRequest(req, { accessSecret = ACCESS_SECRET } = {}) {
  if (hasCloudflareAccessAssertion(req)) {
    return true;
  }

  if (!accessSecret) {
    return false;
  }

  const urlSecret = req?.query?.token;
  const supplied = extractBearerToken(req);

  return urlSecret === accessSecret || supplied === accessSecret;
}

export function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (isAuthorizedRequest(req)) {
    return next();
  }

  if (!ACCESS_SECRET) {
    res.status(500).send("Missing secret");
    return;
  }

  res.status(401).send("Unauthorized");
}
