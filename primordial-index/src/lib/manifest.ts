// Parse + lightly validate agent.yaml. Mirrors the *required* invariants of
// packages/client/.../models.py:AgentManifest, but stays tolerant: the index
// is an additive read layer, so we reject only manifests we cannot index,
// and clamp / default everything else.

import { parse as parseYaml } from 'yaml';
import type { ParsedManifest } from '../types';

const VALID_CATEGORIES = new Set([
  'general', 'coding', 'data', 'writing', 'research',
  'devops', 'security', 'finance', 'science', 'productivity',
]);

const VALID_FILESYSTEM = new Set(['none', 'readonly', 'readwrite']);

const NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const VERSION_RE = /^\d+\.\d+\.\d+([.+-].+)?$/;

export class ManifestError extends Error {}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Parse and validate the raw agent.yaml text. Throws ManifestError on any
 * invariant that would make the entry unusable in the catalog.
 */
export function parseManifest(raw: string): ParsedManifest {
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (e) {
    throw new ManifestError(`agent.yaml is not valid YAML: ${(e as Error).message}`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new ManifestError('agent.yaml must be a mapping');
  }
  const m = doc as Record<string, unknown>;

  const name = asString(m.name)?.trim();
  if (!name || name.length < 3 || name.length > 40 || !NAME_RE.test(name)) {
    throw new ManifestError(`invalid manifest name: ${JSON.stringify(m.name)}`);
  }

  const display_name = asString(m.display_name)?.trim();
  if (!display_name || display_name.length > 80 || !/[a-zA-Z]/.test(display_name)) {
    throw new ManifestError(`invalid display_name: ${JSON.stringify(m.display_name)}`);
  }

  const version = asString(m.version)?.trim();
  if (!version || !VERSION_RE.test(version)) {
    throw new ManifestError(`invalid version: ${JSON.stringify(m.version)}`);
  }

  let description = asString(m.description)?.trim();
  if (!description) {
    throw new ManifestError('description is required');
  }
  if (description.length > 500) description = description.slice(0, 500);

  let category = asString(m.category)?.trim().toLowerCase() || 'general';
  if (!VALID_CATEGORIES.has(category)) category = 'general';

  const tags = Array.isArray(m.tags)
    ? (m.tags as unknown[])
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim())
        .slice(0, 20)
    : [];

  // author.name is required by the client schema.
  const authorRaw = (m.author ?? {}) as Record<string, unknown>;
  const authorName = asString(authorRaw.name)?.trim();
  if (!authorName) {
    throw new ManifestError('author.name is required');
  }

  // Normalize permissions.filesystem.workspace into the contract enum.
  const perms = (m.permissions ?? {}) as Record<string, unknown>;
  const fs = (perms.filesystem ?? {}) as Record<string, unknown>;
  let workspace = asString(fs.workspace)?.trim().toLowerCase() ?? 'readwrite';
  if (!VALID_FILESYSTEM.has(workspace)) workspace = 'readwrite';
  (fs as Record<string, unknown>).workspace = workspace;

  // keys[].provider must be present strings to compute trust.
  const keys = Array.isArray(m.keys)
    ? (m.keys as unknown[])
        .filter((k): k is Record<string, unknown> => !!k && typeof k === 'object')
        .map((k) => ({ ...k, provider: asString(k.provider) ?? '' }))
        .filter((k) => k.provider.length > 0)
    : [];

  return {
    ...m,
    name,
    display_name,
    version,
    description,
    category,
    tags,
    author: {
      name: authorName,
      github: asString(authorRaw.github),
      website: asString(authorRaw.website),
    },
    permissions: { ...perms, filesystem: { ...fs, workspace } } as ParsedManifest['permissions'],
    keys,
  } as ParsedManifest;
}
