// Types mirror the Phase 0 index contract (docs/developers/index-contract.md §1).
// Consumers MUST tolerate unknown fields and null signals — every optional
// field below is typed accordingly. `id` (= "owner/repo") is the join key.

export type FilesystemMode = 'none' | 'readonly' | 'readwrite' | (string & {});
export type TrustTier = 'auto' | 'requires_approval' | (string & {});

export interface Author {
  name?: string | null;
  github?: string | null;
  website?: string | null;
}

export interface Permissions {
  network?: string[] | null;
  network_unrestricted?: boolean | null;
  filesystem?: FilesystemMode | null;
  delegation?: boolean | null;
}

export interface Signals {
  stars?: number | null;
  runs_30d?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  success_rate?: number | null;
}

export interface CatalogAgent {
  id: string;
  url: string;
  ref?: string | null;
  commit?: string | null;
  name?: string | null;
  display_name?: string | null;
  version?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  language?: string | null;
  author?: Author | null;
  providers?: string[] | null;
  permissions?: Permissions | null;
  trust?: TrustTier | null;
  signals?: Signals | null;
  readme_excerpt?: string | null;
  updated_at?: string | null;
  last_crawled?: string | null;
}

export interface Catalog {
  schema_version?: string;
  generated_at?: string;
  agents: CatalogAgent[];
}

// Per-agent detail = catalog fields plus manifest + readme + resolved signals.
export interface AgentDetail extends CatalogAgent {
  manifest?: Record<string, unknown> | null;
  readme_html?: string | null;
  readme_md?: string | null;
}
