import crypto from 'node:crypto';

export const RETENTION_OPERATION_SCHEMA_VERSION = 1;

export function generateRetentionOperationId() {
  return crypto.randomUUID();
}

export function buildRetentionOperationManifest({
  operation = 'retention_preview',
  plan = null,
  preview = null,
  actor = 'gpt-mcp',
  operationId = generateRetentionOperationId(),
  correlationId = generateRetentionOperationId(),
  details = {},
} = {}) {
  if (!operation) {
    throw new Error('retention operation manifest requires operation');
  }

  if (!operationId) {
    throw new Error('retention operation manifest requires operationId');
  }

  if (!correlationId) {
    throw new Error('retention operation manifest requires correlationId');
  }

  return {
    schema_version: RETENTION_OPERATION_SCHEMA_VERSION,
    operation_id: operationId,
    correlation_id: correlationId,
    operation,
    actor,
    created_at: new Date().toISOString(),
    preview_summary: preview ? {
      purge_count: preview.purge_count ?? 0,
      summary: preview.summary || {},
      invalid_metadata_records: preview.invalid_metadata_records?.length || 0,
      invalid_inventory_entries: preview.invalid_inventory_entries?.length || 0,
    } : null,
    plan_summary: plan ? {
      purge_count: plan.purge_count ?? 0,
      source_preview_generated_at: plan.source_preview_generated_at || null,
    } : null,
    details,
  };
}

export function buildRetentionExecutionResultManifest({
  executionResult,
  sourceOperationId,
  correlationId,
  actor = 'gpt-mcp',
  details = {},
}) {
  if (!executionResult || executionResult.mode !== 'execute_result') {
    throw new Error('execution result manifest requires execute_result');
  }

  if (!sourceOperationId) {
    throw new Error('execution result manifest requires sourceOperationId');
  }

  return buildRetentionOperationManifest({
    operation: 'retention_execute_result',
    actor,
    correlationId,
    details: {
      source_operation_id: sourceOperationId,
      requested_count: executionResult.requested_count,
      removed_count: executionResult.removed_count,
      error_count: executionResult.error_count,
      results: executionResult.results,
      ...details,
    },
  });
}

export function retentionOperationFilename(manifest) {
  if (!manifest?.operation_id) {
    throw new Error('retention operation filename requires operation_id');
  }

  return `${manifest.operation_id}.retention.json`;
}

export function retentionOperationRelativePath(manifest) {
  return `meta/${retentionOperationFilename(manifest)}`;
}
