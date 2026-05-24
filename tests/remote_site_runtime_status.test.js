import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyOpsLogLine,
  summarizeOpsLogLines,
  summarizeRuntimeInventory,
  summarizeMetadataRecords,
  buildRemoteSiteRuntimeStatus,
} from '../core/remote_site_runtime_status.js';

test('classifyOpsLogLine recognizes legacy schema', () => {
  const result = classifyOpsLogLine('{"action":"read","remote_path":"index.html"}');
  assert.equal(result.schema, 'legacy_action');
  assert.equal(result.valid, true);
});

test('classifyOpsLogLine recognizes canonical schema', () => {
  const result = classifyOpsLogLine('{"operation":"read","actor":"gpt-mcp"}');
  assert.equal(result.schema, 'canonical_v0');
  assert.equal(result.valid, true);
});

test('classifyOpsLogLine recognizes schema_v1', () => {
  const result = classifyOpsLogLine('{"schema_version":1,"operation_id":"abc","operation":"write"}');
  assert.equal(result.schema, 'schema_v1');
  assert.equal(result.valid, true);
});

test('classifyOpsLogLine rejects invalid JSON', () => {
  const result = classifyOpsLogLine('{invalid');
  assert.equal(result.valid, false);
  assert.equal(result.schema, 'invalid_json');
});

test('summarizeOpsLogLines aggregates schemas', () => {
  const summary = summarizeOpsLogLines([
    '{"action":"read"}',
    '{"operation":"write","actor":"gpt-mcp"}',
    '{"schema_version":1,"operation_id":"abc","operation":"delete"}',
  ]);

  assert.equal(summary.by_schema.legacy_action, 1);
  assert.equal(summary.by_schema.canonical_v0, 1);
  assert.equal(summary.by_schema.schema_v1, 1);
});

test('summarizeRuntimeInventory preserves normalized inventory shape', () => {
  const summary = summarizeRuntimeInventory([
    {
      path: 'logs/site-files.log',
      modified_at: '2026-05-10T00:00:00.000Z',
      size: 100,
      mode: '0666',
    },
  ]);

  assert.equal(summary.total_artifacts, 1);
  assert.equal(summary.by_area.logs, 1);
  assert.deepEqual(summary.permission_warnings, []);
});

test('summarizeMetadataRecords aggregates operations', () => {
  const summary = summarizeMetadataRecords([
    {
      schema_version: 1,
      operation: 'write',
      operation_id: 'abc',
      correlation_id: 'corr',
    },
  ]);

  assert.equal(summary.total_records, 1);
  assert.equal(summary.by_operation.write, 1);
});

test('buildRemoteSiteRuntimeStatus reports attention_required on warnings', () => {
  const status = buildRemoteSiteRuntimeStatus({
    inventoryEntries: [
      {
        path: 'logs/site-files.log',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 100,
        mode: '0666',
      },
    ],
    metadataRecords: [
      {
        schema_version: 1,
        operation: 'write',
        operation_id: 'abc',
      },
    ],
    logLines: [
      '{"schema_version":1,"operation_id":"abc","operation":"write"}',
    ],
  });

  assert.equal(status.status, 'attention_required');
  assert.ok(Array.isArray(status.warnings));
});

test('buildRemoteSiteRuntimeStatus elevates invalid metadata warnings to attention_required', () => {
  const status = buildRemoteSiteRuntimeStatus({
    inventoryEntries: [
      {
        path: 'logs/site-files.log',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 100,
        mode: '0644',
      },
      {
        path: 'meta/a.json',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 50,
        mode: '0644',
      },
      {
        path: 'trash/.keep',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 1,
        mode: '0640',
      },
      {
        path: 'trash/README',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 10,
        mode: '0640',
      },
      {
        path: 'edits/.keep',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 1,
        mode: '0640',
      },
      {
        path: 'edits/README',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 10,
        mode: '0640',
      },
    ],
    metadataRecords: [
      {
        schema_version: 1,
        operation_id: 'abc',
      },
    ],
    logLines: [
      '{"schema_version":1,"operation_id":"abc","operation":"write"}',
    ],
  });

  assert.equal(status.status, 'attention_required');
  assert.ok(status.warnings.some((warning) => warning.code === 'invalid_metadata_records'));
});

test('buildRemoteSiteRuntimeStatus elevates invalid log warnings to attention_required', () => {
  const status = buildRemoteSiteRuntimeStatus({
    inventoryEntries: [
      {
        path: 'logs/site-files.log',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 100,
        mode: '0644',
      },
      {
        path: 'meta/a.json',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 50,
        mode: '0644',
      },
      {
        path: 'trash/.keep',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 1,
        mode: '0640',
      },
      {
        path: 'trash/README',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 10,
        mode: '0640',
      },
      {
        path: 'edits/.keep',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 1,
        mode: '0640',
      },
      {
        path: 'edits/README',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 10,
        mode: '0640',
      },
    ],
    metadataRecords: [
      {
        schema_version: 1,
        operation: 'write',
        operation_id: 'abc',
      },
    ],
    logLines: [
      '{invalid',
    ],
  });

  assert.equal(status.status, 'attention_required');
  assert.ok(status.warnings.some((warning) => warning.code === 'invalid_log_lines'));
});
