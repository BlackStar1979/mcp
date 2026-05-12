export function validateRetentionExecutionPlan(previewReport) {
  if (!previewReport || typeof previewReport !== 'object') {
    throw new Error('retention execution plan requires preview report');
  }

  if (previewReport.mode !== 'preview') {
    throw new Error('retention execution plan must be based on preview mode');
  }

  if (!Array.isArray(previewReport.purge_candidates)) {
    throw new Error('retention execution plan missing purge_candidates');
  }

  const seen = new Set();

  for (const candidate of previewReport.purge_candidates) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('purge candidate must be object');
    }

    if (candidate.purge_candidate !== true) {
      throw new Error('purge candidate missing purge_candidate=true');
    }

    if (candidate.classification !== 'purge_candidate') {
      throw new Error('purge candidate classification must be purge_candidate');
    }

    if (!candidate.relative_path) {
      throw new Error('purge candidate missing relative_path');
    }

    if (candidate.area === 'meta') {
      throw new Error('purge candidate cannot target protected meta area');
    }

    if (candidate.area === 'unknown') {
      throw new Error('purge candidate cannot target unknown area');
    }

    if (String(candidate.relative_path).includes('..')) {
      throw new Error('purge candidate path traversal is forbidden');
    }

    if (seen.has(candidate.relative_path)) {
      throw new Error(`duplicate purge candidate: ${candidate.relative_path}`);
    }

    seen.add(candidate.relative_path);
  }

  return previewReport;
}

export function buildRetentionExecutionPlan(previewReport) {
  const safeReport = validateRetentionExecutionPlan(previewReport);

  return {
    mode: 'execute_plan',
    generated_at: new Date().toISOString(),
    source_preview_generated_at: safeReport.generated_at || null,
    purge_count: safeReport.purge_candidates.length,
    candidates: safeReport.purge_candidates.map((candidate) => ({
      relative_path: candidate.relative_path,
      area: candidate.area,
      modified_at: candidate.modified_at,
      size: candidate.size ?? null,
      reason: candidate.reason,
    })),
  };
}

export async function executeRetentionPlan({
  plan,
  removeArtifact,
}) {
  if (!plan || plan.mode !== 'execute_plan') {
    throw new Error('executeRetentionPlan requires execute_plan');
  }

  if (typeof removeArtifact !== 'function') {
    throw new Error('executeRetentionPlan requires removeArtifact function');
  }

  const results = [];

  for (const candidate of plan.candidates) {
    try {
      await removeArtifact(candidate);
      results.push({
        relative_path: candidate.relative_path,
        status: 'removed',
      });
    } catch (error) {
      results.push({
        relative_path: candidate.relative_path,
        status: 'error',
        error: error.message,
      });
    }
  }

  return {
    mode: 'execute_result',
    executed_at: new Date().toISOString(),
    requested_count: plan.candidates.length,
    removed_count: results.filter((row) => row.status === 'removed').length,
    error_count: results.filter((row) => row.status === 'error').length,
    results,
  };
}
