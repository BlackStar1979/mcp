import fs from "fs/promises";
import path from "path";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message, details = {}) {
  const err = new Error(message);
  err.details = details;
  return err;
}

function normalizeForPattern(value) {
  return String(value || "").replaceAll("\\", "/");
}

function validateValue(schema, value, pointer = "$") {
  if (!isPlainObject(schema)) throw fail(`${pointer}: invalid schema node`);

  if (schema.required) {
    if (!isPlainObject(value)) throw fail(`${pointer}: expected object for required check`);
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw fail(`${pointer}.${key}: required property missing`);
      }
    }
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = allowed.some((type) => {
      if (type === "object") return isPlainObject(value);
      if (type === "array") return Array.isArray(value);
      if (type === "string") return typeof value === "string";
      if (type === "integer") return Number.isInteger(value);
      if (type === "number") return typeof value === "number" && Number.isFinite(value);
      if (type === "boolean") return typeof value === "boolean";
      if (type === "null") return value === null;
      return false;
    });
    if (!ok) throw fail(`${pointer}: invalid type`, { expected: allowed, actual: Array.isArray(value) ? "array" : typeof value });
  }

  if (schema.enum && !schema.enum.includes(value)) {
    throw fail(`${pointer}: value not in enum`, { allowed: schema.enum, actual: value });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) throw fail(`${pointer}: string too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw fail(`${pointer}: string too long`);
    if (schema.pattern) {
      const rx = new RegExp(schema.pattern);
      if (!rx.test(normalizeForPattern(value))) throw fail(`${pointer}: pattern mismatch`, { pattern: schema.pattern });
    }
    if (schema.not?.pattern) {
      const rx = new RegExp(schema.not.pattern);
      if (rx.test(normalizeForPattern(value))) throw fail(`${pointer}: forbidden pattern`, { pattern: schema.not.pattern });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) throw fail(`${pointer}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) throw fail(`${pointer}: above maximum`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw fail(`${pointer}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw fail(`${pointer}: too many items`);
    if (schema.items) {
      value.forEach((item, index) => validateValue(schema.items, item, `${pointer}[${index}]`));
    }
  }

  if (isPlainObject(value)) {
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) throw fail(`${pointer}.${key}: unexpected property`);
      }
    }
    for (const [key, propSchema] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateValue(propSchema, value[key], `${pointer}.${key}`);
    }
  }

  return true;
}

export async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function validateDslInput(schemaPath, input) {
  const schema = await loadJson(schemaPath);
  validateValue(schema, input, "$input");
  return {
    valid: true,
    schema: path.basename(schemaPath),
  };
}

export async function validateOutput(schemaPath, output) {
  const schema = await loadJson(schemaPath);
  validateValue(schema, output, "$output");
  return {
    valid: true,
    schema: path.basename(schemaPath),
  };
}
