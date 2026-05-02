function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSafeId(value, label) {
  assert(typeof value === "string" && /^[a-z0-9][a-z0-9_.-]{1,63}$/.test(value), `${label}: invalid id`);
}

function assertSafePath(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label}: missing path`);
  const normalized = value.replaceAll("\\", "/");
  assert(!/^[A-Za-z]:/.test(normalized), `${label}: absolute drive path blocked`);
  assert(!normalized.startsWith("/") && !normalized.startsWith("//"), `${label}: absolute path blocked`);
  assert(!normalized.split("/").includes(".."), `${label}: traversal blocked`);
}

function validateStepShape(step, index) {
  const where = `steps[${index}]`;
  assert(isPlainObject(step), `${where}: expected object`);
  const allowed = new Set(["step_id", "tool", "operation", "input", "depends_on"]);
  for (const key of Object.keys(step)) assert(allowed.has(key), `${where}: unexpected key ${key}`);

  assertSafeId(step.step_id, `${where}.step_id`);
  assert(step.tool === "code_analysis", `${where}.tool unsupported`);
  assert(step.operation === "apply_patch", `${where}.operation unsupported`);
  assert(Array.isArray(step.depends_on), `${where}.depends_on must be array`);

  const seenDeps = new Set();
  for (const dep of step.depends_on) {
    assertSafeId(dep, `${where}.depends_on[]`);
    assert(!seenDeps.has(dep), `${where}.depends_on duplicate ${dep}`);
    seenDeps.add(dep);
  }

  const input = step.input;
  assert(isPlainObject(input), `${where}.input expected object`);
  for (const key of ["scope", "target", "anchor", "content"]) assert(Object.prototype.hasOwnProperty.call(input, key), `${where}.input.${key} required`);
  assertSafePath(input.scope, `${where}.input.scope`);
  assertSafePath(input.target, `${where}.input.target`);
  assert(typeof input.anchor === "string" && input.anchor.length > 0, `${where}.input.anchor required`);
  assert(typeof input.content === "string", `${where}.input.content must be string`);
}

export function validateDag(plan) {
  assert(isPlainObject(plan), "plan: expected object");
  assertSafeId(plan.plan_id, "plan.plan_id");
  assert(["all_or_nothing", "staged"].includes(plan.mode), "plan.mode invalid");
  assert(Array.isArray(plan.steps) && plan.steps.length > 0, "plan.steps empty");
  assert(plan.steps.length <= 25, "plan.steps exceeds limit 25");

  const ids = new Set();
  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    validateStepShape(step, i);
    assert(!ids.has(step.step_id), `duplicate step_id: ${step.step_id}`);
    ids.add(step.step_id);
  }

  for (const step of plan.steps) {
    for (const dep of step.depends_on) {
      assert(ids.has(dep), `unknown dependency ${dep} for ${step.step_id}`);
      assert(dep !== step.step_id, `self dependency ${step.step_id}`);
    }
  }

  const byId = new Map(plan.steps.map((step) => [step.step_id, step]));
  const state = new Map();
  const order = [];

  function visit(id, stack = []) {
    const s = state.get(id);
    if (s === "visiting") throw new Error(`cycle detected: ${[...stack, id].join(" -> ")}`);
    if (s === "done") return;
    state.set(id, "visiting");
    const step = byId.get(id);
    for (const dep of step.depends_on) visit(dep, [...stack, id]);
    state.set(id, "done");
    order.push(id);
  }

  for (const step of plan.steps) visit(step.step_id);

  return {
    valid: true,
    plan_id: plan.plan_id,
    mode: plan.mode,
    step_count: plan.steps.length,
    execution_order: order,
  };
}
