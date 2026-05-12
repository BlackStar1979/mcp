import { ACCESS_SECRET } from "./config.js";

export function extractBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.["authorization"] || "";
  const parts = String(header).split(/\s+/);
  return parts.length === 2 && parts[0].toLowerCase() === "bearer"
    ? parts[1]
    : null;
}

export function extractQueryToken(req) {
  const token = req?.query?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export function isAuthorizedBearerRequest(req, { accessSecret = ACCESS_SECRET } = {}) {
  if (!accessSecret) {
    return false;
  }

  return extractBearerToken(req) === accessSecret || extractQueryToken(req) === accessSecret;
}

export function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (!ACCESS_SECRET) {
    res.status(500).send("Missing secret");
    return;
  }

  if (isAuthorizedBearerRequest(req)) {
    return next();
  }

  res.status(401).send("Unauthorized");
}

