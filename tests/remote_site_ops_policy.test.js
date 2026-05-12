import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyOpsRelativePath,
  evaluateOpsAreaInitialization,
  evaluateOpsPermissions,
  evaluateOpsPolicy,
  expectedLifecycleMarkers,
  expectedOpsAreas,
} from '../core/remote_site_ops_policy.js';

test('expectedOpsAreas lists canonical opsRoot areas', () => {
  assert.deepEqual(expectedOpsAreas(), ['logs', 'meta', 'edits', 'trash']);
});

test('expectedLifecycleMarkers lists minimal lifecycle markers', () => {
  assert.deepEqual(expectedLifecycleMarkers(), ['.keep', 'README']);
});

test('classifyOpsRelativePath identifies markers', () => {
  const classified = classifyOpsRelativePath('edits/.keep');
  assert.equal(classified.area, 'edits');
  assert.equal(classified.basename, '.keep');
  assert.equal(classified.is_marker, true);
});

test('evaluateOpsAreaInitialization accepts initialized marker areas', () => {
  const result = evaluateOpsAreaInitialization([
    { path: 'edits/.keep' },
    { path: 'edits/README' },
    { path: 'trash/.keep' },
    { path: 'trash/README' },
  ]);

  assert.deepEqual(result.missing_initialized_areas, []);
});

test('evaluateOpsAreaInitialization flags missing marker areas', () => {
  const result = evaluateOpsAreaInitialization([
    { path: 'logs/site-files.log' },
    { path: 'meta/a.json' },
  ]);

  assert.deepEqual(result.missing_initialized_areas, ['edits', 'trash']);
});

test('evaluateOpsPermissions flags mode mismatches', () => {
  const result = evaluateOpsPermissions([
    { path: 'logs/site-files.log', mode: '0666' },
    { path: 'meta/a.json', mode: '0666' },
    { path: 'edits/.keep', mode: '0640' },
  ]);

  assert.equal(result.mismatch_count, 2);
  assert.equal(result.findings[0].expected_mode, '0644');
});

test('evaluateOpsPermissions normalizes SFTP rights objects', () => {
  const result = evaluateOpsPermissions([
    {
      path: 'logs/site-files.log',
      rights: {
        user: 'rw',
        group: 'r',
        other: 'r',
      },
    },
    {
      path: 'edits/.keep',
      rights: {
        user: 'rw',
        group: 'r',
        other: '',
      },
    },
  ]);

  assert.equal(result.findings.length, 0);
});

test('evaluateOpsPolicy returns healthy for initialized and normalized entries', () => {
  const result = evaluateOpsPolicy([
    { path: 'logs/site-files.log', mode: '0644' },
    { path: 'meta/a.json', mode: '0644' },
    { path: 'edits/.keep', mode: '0640' },
    { path: 'edits/README', mode: '0640' },
    { path: 'trash/.keep', mode: '0640' },
    { path: 'trash/README', mode: '0640' },
  ]);

  assert.equal(result.status, 'healthy');
  assert.equal(result.warnings.length, 0);
});

test('evaluateOpsPolicy returns attention_required for current observed baseline shape', () => {
  const result = evaluateOpsPolicy([
    { path: 'logs/site-files.log', mode: '0666' },
    { path: 'meta/a.json', mode: '0666' },
  ]);

  assert.equal(result.status, 'attention_required');
  assert.equal(result.warnings.length, 2);
});
