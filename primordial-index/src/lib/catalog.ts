// Pure catalog-building logic. Given a repo, its resolved ref/commit, the
// parsed manifest, README text, and a Signals object, produce a CatalogAgent
// exactly per index-contract.md §1. No I/O here — easy to unit-test.

import type {
  CatalogAgent,
  CatalogPermissions,
  GitHubRepo,
  ParsedManifest,
  Signals,
} from '../types';
import { assessTrust } from './trust';

const README_EXCERPT_LEN = 280;

/** Strip the most common markdown so list cards show readable text. */
export function readmeExcerpt(md: string, len = README_EXCERPT_LEN): string {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len).trimEnd() : text;
}

function mapPermissions(m: ParsedManifest): CatalogPermissions {
  const p = m.permissions ?? {};
  const network = (p.network ?? [])
    .map((n) => n.domain)
    .filter((d): d is string => typeof d === 'string' && d.length > 0);
  const workspace = (p.filesystem?.workspace ?? 'readwrite') as CatalogPermissions['filesystem'];
  return {
    network,
    network_unrestricted: p.network_unrestricted === true,
    filesystem: workspace,
    delegation: p.delegation?.enabled === true,
  };
}

export interface BuildArgs {
  repo: GitHubRepo;
  ref: string;
  commit: string;
  manifest: ParsedManifest;
  readme: string;
  signals: Signals;
  crawledAt: string; // ISO8601
}

export function buildCatalogAgent(args: BuildArgs): CatalogAgent {
  const { repo, ref, commit, manifest, readme, signals, crawledAt } = args;
  return {
    id: repo.full_name,
    url: repo.html_url,
    ref,
    commit,
    name: manifest.name,
    display_name: manifest.display_name,
    version: manifest.version,
    description: manifest.description,
    category: manifest.category ?? 'general',
    tags: manifest.tags ?? [],
    language: manifest.runtime?.language ?? 'python',
    author: {
      name: manifest.author?.name ?? repo.full_name.split('/')[0],
      github: manifest.author?.github ?? null,
      website: manifest.author?.website ?? null,
    },
    providers: (manifest.keys ?? []).map((k) => k.provider),
    permissions: mapPermissions(manifest),
    trust: assessTrust(manifest),
    signals,
    readme_excerpt: readmeExcerpt(readme),
    updated_at: repo.pushed_at,
    last_crawled: crawledAt,
  };
}
