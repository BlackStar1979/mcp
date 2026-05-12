import {
  buildRetentionPreviewReport,
  assertPreviewReportSafe,
} from './remote_site_retention_preview_engine.js';

import {
  buildRetentionOperationManifest,
} from './remote_site_retention_operation_writer.js';

export async function collectRemoteRetentionInventory({
  listInventory,
}) {
  if (typeof listInventory !== 'function') {
    throw new Error('collectRemoteRetentionInventory requires listInventory function');
  }

  const entries = await listInventory();

  if (!Array.isArray(entries)) {
    throw new Error('listInventory must return array');
  }

  return entries;
}

export async function collectRemoteRetentionMetadata({
  listMetadataFiles,
  readMetadataFile,
}) {
  if (typeof listMetadataFiles !== 'function') {
    throw new Error('collectRemoteRetentionMetadata requires listMetadataFiles');
  }

  if (typeof readMetadataFile !== 'function') {
    throw new Error('collectRemoteRetentionMetadata requires readMetadataFile');
  }

  const files = await listMetadataFiles();

  if (!Array.isArray(files)) {
    throw new Error('listMetadataFiles must return array');
  }

  const records = [];

  for (const file of files) {
    try {
      const text = await readMetadataFile(file);
      records.push(JSON.parse(text));
    } catch {
      records.push({
        schema_version: -1,
        invalid_metadata_file: file,
      });
    }
  }

  return records;
}

export async function buildRemoteRetentionPreview({
  inventoryEntries,
  metadataRecords,
  policy,
  now,
}) {
  const report = buildRetentionPreviewReport({
    inventoryEntries,
    metadataRecords,
    policy,
    now,
  });

  return assertPreviewReportSafe(report);
}

export async function buildRemoteRetentionPreviewOperation({
  inventoryEntries,
  metadataRecords,
  policy,
  now,
  actor = 'gpt-mcp',
}) {
  const preview = await buildRemoteRetentionPreview({
    inventoryEntries,
    metadataRecords,
    policy,
    now,
  });

  const manifest = buildRetentionOperationManifest({
    operation: 'retention_preview',
    actor,
    preview,
  });

  return {
    mode: 'retention_preview_operation',
    preview,
    manifest,
  };
}
