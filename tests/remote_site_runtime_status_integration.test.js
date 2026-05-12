import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRemoteSiteRuntimeStatus,
} from '../core/remote_site_runtime_status.js';

test('runtime status recognizes missing lifecycle marker areas', () => {
  const status = buildRemoteSiteRuntimeStatus({
    inventoryEntries: [
      {
        path: 'logs/site-files.log',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 123,
      },
    ],
    metadataRecords: [],
    logLines: [],
  });

  const missing = status.warnings.find((w) => w.code === 'lifecycle_markers_missing');

  assert.ok(missing);
  assert.ok(missing.areas.includes('edits'));
  assert.ok(missing.areas.includes('trash'));
});

test('runtime status reports ok for balanced bounded inventory', () => {
  const status = buildRemoteSiteRuntimeStatus({
    inventoryEntries: [
      {
        path: 'logs/site-files.log',
        modified_at: '2026-05-10T00:00:00.000Z',
        size: 123,
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
      '{"schema_version":1,"operation_id":"abc","operation":"write"}',
    ],
  });

  assert.equal(status.status, 'healthy');
  assert.equal(status.warnings.length, 0);
});
