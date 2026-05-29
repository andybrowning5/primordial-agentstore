// Data layer for the storefront. At build time (Astro is static-first) this
// resolves the catalog + per-agent detail either from the live index service
// (when PRIMORDIAL_INDEX_URL is set) or from the bundled local fixtures.
//
// Endpoints (contract §2):
//   GET /catalog
//   GET /agents/:owner/:repo
//   GET /agents/:owner/:repo/stats
//
// Everything is fetched once at build and baked into static HTML.

import type { Catalog, CatalogAgent, AgentDetail, Signals } from './types';
import catalogFixture from '../fixtures/catalog.json';

const INDEX_URL = (import.meta.env.PRIMORDIAL_INDEX_URL || process.env.PRIMORDIAL_INDEX_URL || '')
  .toString()
  .replace(/\/$/, '');

export const usingLiveIndex = INDEX_URL.length > 0;

// Eagerly load all fixture detail files so we can resolve any agent at build.
const detailFixtures = import.meta.glob<{ default: AgentDetail }>(
  '../fixtures/details/*.json',
  { eager: true },
);

function detailKey(id: string): string {
  // "owner/repo" -> "owner__repo" (matches the fixture filenames)
  return id.replace('/', '__');
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEX_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Index request failed: ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getCatalog(): Promise<Catalog> {
  if (usingLiveIndex) {
    try {
      return await fetchJson<Catalog>('/catalog');
    } catch (e) {
      // The index returns 503 until its first crawl, and may be briefly
      // unreachable. Build an empty storefront rather than failing the build;
      // a later rebuild picks up the populated catalog.
      console.warn(`[data] live catalog unavailable, building empty: ${(e as Error).message}`);
      return { schema_version: '1', generated_at: '', agents: [] };
    }
  }
  return catalogFixture as Catalog;
}

export async function getAgents(): Promise<CatalogAgent[]> {
  const catalog = await getCatalog();
  return Array.isArray(catalog.agents) ? catalog.agents : [];
}

export async function getAgentDetail(id: string): Promise<AgentDetail | null> {
  if (usingLiveIndex) {
    try {
      return await fetchJson<AgentDetail>(`/agents/${id}`);
    } catch {
      return null;
    }
  }

  // Merge the catalog entry (list fields) with the fixture detail (manifest + readme).
  const agents = await getAgents();
  const base = agents.find((a) => a.id === id) ?? null;
  const mod = detailFixtures[`../fixtures/details/${detailKey(id)}.json`];
  const extra = mod?.default ?? null;
  if (!base && !extra) return null;
  return { ...(base ?? ({} as CatalogAgent)), ...(extra ?? {}) } as AgentDetail;
}

// Optional live stats refresh (contract §2 GET /agents/:owner/:repo/stats).
// Static build folds these into the baked detail page; falls back silently.
export async function getAgentStats(id: string): Promise<Signals | null> {
  if (!usingLiveIndex) return null;
  try {
    return await fetchJson<Signals>(`/agents/${id}/stats`);
  } catch {
    return null;
  }
}
