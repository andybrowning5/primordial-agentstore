// Thin GitHub REST client for the crawler. Uses the optional GITHUB_TOKEN for
// higher rate limits. All calls go to api.github.com (raw.githubusercontent is
// avoided in favor of the contents API so a single token/host suffices).

import type { GitHubRepo } from '../types';

const API = 'https://api.github.com';
const UA = 'primordial-index-crawler';

export interface GitHubTag {
  name: string;
  commit: { sha: string };
}

function ghHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': UA,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson<T>(url: string, token?: string): Promise<T> {
  const resp = await fetch(url, { headers: ghHeaders(token) });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GitHub ${resp.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

/** Search repos carrying a topic, paging until exhausted (cap 1000 — API max). */
export async function searchTopic(topic: string, token?: string): Promise<GitHubRepo[]> {
  const out: GitHubRepo[] = [];
  const perPage = 100;
  for (let page = 1; page <= 10; page++) {
    const url =
      `${API}/search/repositories?q=${encodeURIComponent(`topic:${topic}`)}` +
      `&sort=stars&order=desc&per_page=${perPage}&page=${page}`;
    const data = await ghJson<{ items: GitHubRepo[] }>(url, token);
    out.push(...(data.items ?? []));
    if (!data.items || data.items.length < perPage) break;
  }
  return out;
}

/** Crawl all configured topics, dedup by full_name. */
export async function discoverRepos(topics: string[], token?: string): Promise<GitHubRepo[]> {
  const seen = new Map<string, GitHubRepo>();
  for (const topic of topics) {
    const repos = await searchTopic(topic, token);
    for (const r of repos) {
      if (!seen.has(r.full_name)) seen.set(r.full_name, r);
    }
  }
  return [...seen.values()];
}

/**
 * Resolve the ref to index: the highest semver tag if any, else the default
 * branch. Returns the ref name and the commit SHA it points at.
 */
export async function resolveRef(
  repo: GitHubRepo,
  token?: string,
): Promise<{ ref: string; commit: string }> {
  const [owner, name] = repo.full_name.split('/');
  let tags: GitHubTag[] = [];
  try {
    tags = await ghJson<GitHubTag[]>(
      `${API}/repos/${owner}/${name}/tags?per_page=100`,
      token,
    );
  } catch {
    tags = [];
  }
  const semverTags = tags
    .map((t) => ({ tag: t, sv: parseSemver(t.name) }))
    .filter((x): x is { tag: GitHubTag; sv: number[] } => x.sv !== null);

  if (semverTags.length > 0) {
    semverTags.sort((a, b) => compareSemver(b.sv, a.sv));
    const best = semverTags[0].tag;
    return { ref: best.name, commit: best.commit.sha };
  }

  // Fall back to the default branch HEAD.
  const branch = await ghJson<{ commit: { sha: string } }>(
    `${API}/repos/${owner}/${name}/branches/${encodeURIComponent(repo.default_branch)}`,
    token,
  );
  return { ref: repo.default_branch, commit: branch.commit.sha };
}

/** Fetch a single repo's metadata (includes its topics). null if 404. */
export async function fetchRepo(fullName: string, token?: string): Promise<GitHubRepo | null> {
  const resp = await fetch(`${API}/repos/${fullName}`, { headers: ghHeaders(token) });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GitHub ${resp.status} for repo ${fullName}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<GitHubRepo>;
}

/** Fetch a text file at a ref via the contents API. null if 404. */
export async function fetchFile(
  fullName: string,
  path: string,
  ref: string,
  token?: string,
): Promise<string | null> {
  const url = `${API}/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const resp = await fetch(url, {
    headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw+json' },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`GitHub ${resp.status} fetching ${path} in ${fullName}`);
  }
  return resp.text();
}

// ── semver helpers (tolerant of a leading "v") ──
export function parseSemver(tag: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
