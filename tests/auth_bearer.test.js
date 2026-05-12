import test from "node:test";
import assert from "node:assert/strict";

import {
  extractBearerToken,
  extractQueryToken,
  isAuthorizedBearerRequest,
} from "../core/auth_bearer.js";

function req({ method = "POST", headers = {}, query = {} } = {}) {
  return {
    method,
    headers,
    query,
  };
}

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


test("legacy query token extraction stays stable in bearer mode", () => {
  assert.equal(extractQueryToken(req({ query: { token: "query-secret" } })), "query-secret");
  assert.equal(extractQueryToken(req({ query: { token: "   " } })), null);
});
test("bearer auth accepts only matching bearer token", () => {
  assert.equal(
    isAuthorizedBearerRequest(req({ headers: { authorization: "Bearer legacy-secret" } }), { accessSecret: "legacy-secret" }),
    true
  );
  assert.equal(
    isAuthorizedBearerRequest(req({ headers: { authorization: "Bearer wrong" } }), { accessSecret: "legacy-secret" }),
    false
  );
  assert.equal(
    isAuthorizedBearerRequest(req({}), { accessSecret: "legacy-secret" }),
    false
  );
  assert.equal(
    isAuthorizedBearerRequest(req({ query: { token: "legacy-secret" } }), { accessSecret: "legacy-secret" }),
    true
  );
  assert.equal(
    isAuthorizedBearerRequest(req({ query: { token: "wrong" } }), { accessSecret: "legacy-secret" }),
    false
  );
});



