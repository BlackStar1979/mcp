const DEFAULT_AREA_POLICY = Object.freeze({
  logs: Object.freeze({ initialized: true, marker_required: false, expected_mode: '0644' }),
  meta: Object.freeze({ initialized: true, marker_required: false, expected_mode: '0644' }),
  edits: Object.freeze({ initialized: true, marker_required: true, expected_mode: '0640' }),
  trash: Object.freeze({ initialized: true, marker_required: true, expected_mode: '0640' }),
});

const DEFAULT_MARKERS = Object.freeze(['.keep', 'README']);

function rightsPartToOctal(part) {
  if (typeof part !== 'string') return 0;
  let value = 0;
  if (part.includes('r')) value += 4;
  if (part.includes('w')) value += 2;
  if (part.includes('x')) value += 1;
  return value;
}

function normalizeMode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `0${(value & 0o777).toString(8)}`;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.mode !== undefined) return normalizeMode(value.mode);
    if ('user' in value || 'group' in value || 'other' in value) {
      return `0${rightsPartToOctal(value.user)}${rightsPartToOctal(value.group)}${rightsPartToOctal(value.other)}`;
    }
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (/^[0-7]{3,4}$/.test(trimmed)) return trimmed.length === 3 ? `0${trimmed}` : trimmed;
    return trimmed;
  }

  return null;
}

export function expectedOpsAreas() {
  return Object.keys(DEFAULT_AREA_POLICY);
}

export function expectedLifecycleMarkers() {
  return Array.from(DEFAULT_MARKERS);
}

export function getOpsAreaPolicy(area) {
  return DEFAULT_AREA_POLICY[area] || null;
}

export function classifyOpsRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error('relativePath must be non-empty string');
  }

  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const [area, ...rest] = normalized.split('/');

  return {
    relative_path: normalized,
    area,
    name: rest.join('/'),
    basename: rest.at(-1) || '',
    is_marker: DEFAULT_MARKERS.includes(rest.at(-1) || ''),
  };
}

export function evaluateOpsAreaInitialization(entries) {
  if (!Array.isArray(entries)) throw new Error('entries must be array');

  const by_area = {};
  for (const area of expectedOpsAreas()) {
    by_area[area] = {
      area,
      present_files: 0,
      markers_found: [],
      marker_required: DEFAULT_AREA_POLICY[area].marker_required,
      initialized: !DEFAULT_AREA_POLICY[area].marker_required,
    };
  }

  for (const entry of entries) {
    const rel = entry.relative_path || entry.path;
    if (!rel) continue;
    const classified = classifyOpsRelativePath(rel);
    if (!by_area[classified.area]) continue;

    by_area[classified.area].present_files += 1;
    if (classified.is_marker) {
      by_area[classified.area].markers_found.push(classified.basename);
    }
  }

  for (const area of expectedOpsAreas()) {
    const state = by_area[area];
    if (state.marker_required) {
      state.initialized = DEFAULT_MARKERS.every((marker) => state.markers_found.includes(marker));
    }
  }

  return {
    by_area,
    missing_initialized_areas: Object.values(by_area)
      .filter((state) => !state.initialized)
      .map((state) => state.area),
  };
}

export function evaluateOpsPermissions(entries) {
  if (!Array.isArray(entries)) throw new Error('entries must be array');

  const findings = [];

  for (const entry of entries) {
    const rel = entry.relative_path || entry.path;
    if (!rel) continue;

    const classified = classifyOpsRelativePath(rel);
    const policy = getOpsAreaPolicy(classified.area);
    if (!policy) continue;

    const mode = normalizeMode(entry.mode ?? entry.permissions ?? entry.rights?.mode ?? entry.rights);
    if (!mode) {
      findings.push({
        relative_path: classified.relative_path,
        area: classified.area,
        expected_mode: policy.expected_mode,
        actual_mode: null,
        result: 'unknown_mode',
      });
      continue;
    }

    if (mode !== policy.expected_mode) {
      findings.push({
        relative_path: classified.relative_path,
        area: classified.area,
        expected_mode: policy.expected_mode,
        actual_mode: mode,
        result: 'mode_mismatch',
      });
    }
  }

  return {
    findings,
    mismatch_count: findings.filter((item) => item.result === 'mode_mismatch').length,
    unknown_count: findings.filter((item) => item.result === 'unknown_mode').length,
  };
}

export function evaluateOpsPolicy(entries) {
  const initialization = evaluateOpsAreaInitialization(entries);
  const permissions = evaluateOpsPermissions(entries);

  const warnings = [];
  if (initialization.missing_initialized_areas.length) {
    warnings.push({
      code: 'lifecycle_markers_missing',
      areas: initialization.missing_initialized_areas,
    });
  }
  if (permissions.findings.length) {
    warnings.push({
      code: 'permission_policy_findings',
      count: permissions.findings.length,
    });
  }

  return {
    status: warnings.length ? 'attention_required' : 'healthy',
    initialization,
    permissions,
    warnings,
  };
}
