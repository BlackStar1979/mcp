import test from "node:test";
import assert from "node:assert/strict";

import {
  hasCloudflareAccessAssertion,
  extractBearerToken,
  isAuthorizedRequest,
} from "../core/auth.js";

function req({ method = "POST", query = {}, headers = {} } = {}) {
  return {
    method,
    query,
    headers,
  };
}

test("Cloudflare Access assertion authorizes request without legacy MCP token", () => {
  assert.equal(
    hasCloudflareAccessAssertion(req({ headers: { "cf-access-jwt-assertion": "jwt-value" } })),
    true
  );
  assert.equal(
    isAuthorizedRequest(req({ headers: { "cf-access-jwt-assertion": "jwt-value" } }), { accessSecret: null }),
    true
  );
});

test("empty Cloudflare Access assertion is ignored", () => {
  assert.equal(
    hasCloudflareAccessAssertion(req({ headers: { "cf-access-jwt-assertion": "   " } })),
    false
  );
});

test("legacy bearer token extraction stays stable", () => {
  assert.equal(
    extractBearerToken(req({ headers: { authorization: "Bearer legacy-secret" } })),
    "legacy-secret"
  );
  assert.equal(
    extractBearerToken(req({ headers: { authorization: "Token legacy-secret" } })),
    null
  );
});

test("legacy MCP token fallback still works for query and bearer", () => {
  assert.equal(
    isAuthorizedRequest(req({ query: { token: "legacy-secret" } }), { accessSecret: "legacy-secret" }),
    true
  );
  assert.equal(
    isAuthorizedRequest(req({ headers: { authorization: "Bearer legacy-secret" } }), { accessSecret: "legacy-secret" }),
    true
  );
  assert.equal(
    isAuthorizedRequest(req({}), { accessSecret: "legacy-secret" }),
    false
  );
});
