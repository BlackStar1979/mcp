import { audit } from "./audit.js";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

export function hasCloudflareAccessAssertion(req) {
  const value = req?.headers?.[ACCESS_JWT_HEADER];
  return typeof value === "string" && value.trim().length > 0;
}

export function isAuthorizedRequest(req) {
  return hasCloudflareAccessAssertion(req);
}

export function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (isAuthorizedRequest(req)) {
    return next();
  }

  void audit("auth_access_denied", {
    method: req.method,
    url: req.originalUrl || req.url,
    reason: "missing_cloudflare_access_assertion",
  }).catch(() => {});
  res.status(401).send("Unauthorized");
}
