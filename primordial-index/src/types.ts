// Shared types. catalog.json shape mirrors index-contract.md §1 exactly.

export interface Env {
  DB: D1Database;
  CATALOG: R2Bucket;
  RATELIMIT: KVNamespace;
  // Secret — set via `wrangler secret put GITHUB_TOKEN`.
  GITHUB_TOKEN?: string;
  // Vars (wrangler.toml [vars]); arrive as strings.
  GITHUB_TOPIC?: string;
  GITHUB_EXTRA_TOPICS?: string;
  SIGNALS_WINDOW_DAYS?: string;
  WRITE_RATE_PER_MIN?: string;
}

export interface AuthorInfo {
  name: string;
  github: string | null;
  website: string | null;
}

export interface CatalogPermissions {
  network: string[];
  network_unrestricted: boolean;
  filesystem: 'none' | 'readonly' | 'readwrite';
  delegation: boolean;
}

export interface Signals {
  stars: number;
  runs_30d: number;
  rating_avg: number | null;
  rating_count: number;
  success_rate: number | null;
}

export type TrustTier = 'auto' | 'requires_approval';

export interface CatalogAgent {
  id: string; // owner/repo — the join key everywhere
  url: string;
  ref: string;
  commit: string;
  name: string;
  display_name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  language: string;
  author: AuthorInfo;
  providers: string[];
  permissions: CatalogPermissions;
  trust: TrustTier;
  signals: Signals;
  readme_excerpt: string;
  updated_at: string;
  last_crawled: string;
}

export interface Catalog {
  schema_version: string;
  generated_at: string;
  agents: CatalogAgent[];
}

// Per-agent detail = catalog fields + manifest + readme.
export interface AgentDetail extends CatalogAgent {
  manifest: unknown; // full parsed agent.yaml
  readme_md: string;
}

// ── Parsed manifest (subset we extract; tolerant of unknown fields) ──
export interface ManifestKey {
  provider: string;
  [k: string]: unknown;
}

export interface ParsedManifest {
  name: string;
  display_name: string;
  version: string;
  description: string;
  category?: string;
  tags?: string[];
  author?: { name?: string; github?: string; website?: string };
  runtime?: { language?: string; [k: string]: unknown };
  permissions?: {
    network?: Array<{ domain: string; reason?: string }>;
    network_unrestricted?: boolean;
    filesystem?: { workspace?: string };
    delegation?: { enabled?: boolean; allowed_agents?: string[] };
  };
  keys?: ManifestKey[];
  [k: string]: unknown;
}

// Minimal GitHub repo shape (search + repo endpoints).
export interface GitHubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
  default_branch: string;
  // Present on the GET /repos/:owner/:repo response; used by the on-demand
  // /refresh path to verify a repo actually carries a primordial topic.
  topics?: string[];
}
