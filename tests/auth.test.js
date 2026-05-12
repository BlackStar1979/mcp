import test from "node:test";
import assert from "node:assert/strict";

import {
  hasCloudflareAccessAssertion,
  isAuthorizedRequest,
} from "../core/auth.js";

function req({ method = "POST", query = {}, headers = {} } = {}) {
  return {
    method,
    query,
    headers,
  };
}

test("Cloudflare Access assertion authorizes request", () => {
  assert.equal(
    hasCloudflareAccessAssertion(req({ headers: { "cf-access-jwt-assertion": "jwt-value" } })),
    true
  );
  assert.equal(
    isAuthorizedRequest(req({ headers: { "cf-access-jwt-assertion": "jwt-value" } })),
    true
  );
});

test("empty Cloudflare Access assertion is ignored", () => {
  assert.equal(
    hasCloudflareAccessAssertion(req({ headers: { "cf-access-jwt-assertion": "   " } })),
    false
  );
});

test("access auth no longer accepts legacy bearer fallback", () => {
  assert.equal(
    isAuthorizedRequest(req({ headers: { authorization: "Bearer legacy-secret" } })),
    false
  );
  assert.equal(
    isAuthorizedRequest(req({ query: { token: "legacy-secret" } })),
    false
  );
});
