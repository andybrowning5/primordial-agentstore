// Scheduled crawler. Walks the primordial-agent topic(s), validates each
// agent.yaml, resolves ref+commit, folds in D1 signals, and writes
// catalog.json + per-agent detail JSON to R2.

import type { Catalog, CatalogAgent, Env, AgentDetail } from './types';
import { discoverRepos, resolveRef, fetchFile, fetchRepo } from './lib/github';
import { parseManifest, ManifestError } from './lib/manifest';
import { aggregateSignals, toSignals, statsFor } from './lib/signals';
import { buildCatalogAgent } from './lib/catalog';

const SCHEMA_VERSION = '1';

export interface CrawlResult {
  indexed: number;
  skipped: number;
  errors: Array<{ repo: string; reason: string }>;
}

export function topicsOf(env: Env): string[] {
  const main = (env.GITHUB_TOPIC ?? 'primordial-agent').trim();
  const extra = (env.GITHUB_EXTRA_TOPICS ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return [main, ...extra];
}

export async function crawl(env: Env): Promise<CrawlResult> {
  const token = env.GITHUB_TOKEN;
  const windowDays = Number(env.SIGNALS_WINDOW_DAYS ?? '30') || 30;
  const crawledAt = new Date().toISOString();

  const [repos, signalsMap] = await Promise.all([
    discoverRepos(topicsOf(env), token),
    aggregateSignals(env.DB, windowDays),
  ]);

  const result: CrawlResult = { indexed: 0, skipped: 0, errors: [] };
  const catalog: Catalog = {
    schema_version: SCHEMA_VERSION,
    generated_at: crawledAt,
    agents: [],
  };

  for (const repo of repos) {
    try {
      const { ref, commit } = await resolveRef(repo, token);
      const yamlText = await fetchFile(repo.full_name, 'agent.yaml', ref, token);
      if (yamlText === null) {
        result.skipped++;
        result.errors.push({ repo: repo.full_name, reason: 'no agent.yaml at ref' });
        continue;
      }
      const manifest = parseManifest(yamlText);
      const readme =
        (await fetchFile(repo.full_name, 'README.md', ref, token).catch(() => null)) ?? '';

      const signals = toSignals(repo.stargazers_count, signalsMap.get(repo.full_name));
      const agent = buildCatalogAgent({ repo, ref, commit, manifest, readme, signals, crawledAt });
      catalog.agents.push(agent);

      // Per-agent detail file for storefront detail pages.
      const detail: AgentDetail = { ...agent, manifest, readme_md: readme };
      await env.CATALOG.put(detailKey(repo.full_name), JSON.stringify(detail), {
        httpMetadata: { contentType: 'application/json' },
      });
      result.indexed++;
    } catch (e) {
      result.skipped++;
      const reason = e instanceof ManifestError ? `invalid manifest: ${e.message}` : (e as Error).message;
      result.errors.push({ repo: repo.full_name, reason });
    }
  }

  // Stable ordering: stars desc, then id, so diffs are minimal.
  catalog.agents.sort(
    (a, b) => b.signals.stars - a.signals.stars || a.id.localeCompare(b.id),
  );

  await env.CATALOG.put('catalog.json', JSON.stringify(catalog), {
    httpMetadata: { contentType: 'application/json' },
  });

  return result;
}

/** R2 object key for a per-agent detail file. */
export function detailKey(agentId: string): string {
  return `agents/${agentId}.json`;
}

export type RefreshResult =
  | { indexed: true; id: string }
  | { indexed: false; id: string; reason: string };

/**
 * On-demand single-agent refresh (POST /refresh). Re-indexes one repo without a
 * full crawl — used right after `primordial publish`.
 *
 * Abuse guard: the repo MUST carry one of the configured topics, otherwise it is
 * NOT indexed. This prevents an attacker from POSTing /refresh with an arbitrary
 * `agent_id` to inject a repo that never opted into the marketplace.
 */
export async function crawlOne(env: Env, agentId: string): Promise<RefreshResult> {
  const token = env.GITHUB_TOKEN;
  const windowDays = Number(env.SIGNALS_WINDOW_DAYS ?? '30') || 30;
  const crawledAt = new Date().toISOString();

  const repo = await fetchRepo(agentId, token);
  if (!repo) return { indexed: false, id: agentId, reason: 'repo not found' };

  const topics = new Set(repo.topics ?? []);
  if (!topicsOf(env).some((t) => topics.has(t))) {
    return { indexed: false, id: agentId, reason: 'repo does not carry a primordial-agent topic' };
  }

  const { ref, commit } = await resolveRef(repo, token);
  const yamlText = await fetchFile(repo.full_name, 'agent.yaml', ref, token);
  if (yamlText === null) return { indexed: false, id: agentId, reason: 'no agent.yaml at ref' };

  const manifest = parseManifest(yamlText);
  const readme =
    (await fetchFile(repo.full_name, 'README.md', ref, token).catch(() => null)) ?? '';

  const signals = { stars: repo.stargazers_count, ...(await statsFor(env.DB, repo.full_name, windowDays)) };
  const agent = buildCatalogAgent({ repo, ref, commit, manifest, readme, signals, crawledAt });

  const detail: AgentDetail = { ...agent, manifest, readme_md: readme };
  await env.CATALOG.put(detailKey(repo.full_name), JSON.stringify(detail), {
    httpMetadata: { contentType: 'application/json' },
  });

  await upsertCatalogAgent(env, agent, crawledAt);
  return { indexed: true, id: agent.id };
}

/** Insert-or-replace one agent in catalog.json, re-sorting to match a full crawl. */
async function upsertCatalogAgent(env: Env, agent: CatalogAgent, crawledAt: string): Promise<void> {
  const existing = await env.CATALOG.get('catalog.json');
  let catalog: Catalog;
  if (existing) {
    catalog = JSON.parse(await existing.text()) as Catalog;
    if (!Array.isArray(catalog.agents)) catalog.agents = [];
  } else {
    catalog = { schema_version: SCHEMA_VERSION, generated_at: crawledAt, agents: [] };
  }

  const idx = catalog.agents.findIndex((a) => a.id === agent.id);
  if (idx >= 0) catalog.agents[idx] = agent;
  else catalog.agents.push(agent);

  catalog.generated_at = crawledAt;
  catalog.agents.sort(
    (a, b) => b.signals.stars - a.signals.stars || a.id.localeCompare(b.id),
  );

  await env.CATALOG.put('catalog.json', JSON.stringify(catalog), {
    httpMetadata: { contentType: 'application/json' },
  });
}
