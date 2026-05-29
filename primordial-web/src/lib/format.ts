import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { CatalogAgent } from './types';

// READMEs come from arbitrary GitHub repos — untrusted content. We render
// markdown to HTML, then sanitize before injecting via set:html, so a malicious
// README cannot inject <script> / event handlers / javascript: URLs (XSS).
const SANITIZE_OPTS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title'],
    a: ['href', 'name', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // External links open in a new tab and don't leak referrer / pass link juice.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener nofollow', target: '_blank' }),
  },
};

/** Render an agent's README to sanitized HTML. Prefers server-provided HTML,
 *  else renders markdown. Always sanitized. Returns null when there's no readme. */
export function renderReadme(
  detail: { readme_html?: string | null; readme_md?: string | null },
): string | null {
  const raw = detail.readme_html ?? (detail.readme_md ? (marked.parse(detail.readme_md) as string) : null);
  if (!raw) return null;
  return sanitizeHtml(raw, SANITIZE_OPTS);
}

export function displayName(a: CatalogAgent): string {
  return a.display_name || a.name || a.id;
}

// "owner/repo" -> { owner, repo }
export function splitId(id: string): { owner: string; repo: string } {
  const [owner, ...rest] = id.split('/');
  return { owner, repo: rest.join('/') };
}

export function fmtCount(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`.replace('.0k', 'k');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

export function fmtRating(avg: number | null | undefined, count: number | null | undefined): string {
  if (avg == null || !count) return 'No ratings';
  return `${avg.toFixed(1)} (${count})`;
}

export function fmtPercent(p: number | null | undefined): string {
  if (p == null) return '—';
  return `${Math.round(p * 100)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const TRUST_LABELS: Record<string, string> = {
  auto: 'Auto-approve',
  requires_approval: 'Requires approval',
};

export function trustLabel(trust: string | null | undefined): string {
  if (!trust) return 'Unknown';
  return TRUST_LABELS[trust] ?? trust;
}

const FS_LABELS: Record<string, string> = {
  none: 'No filesystem access',
  readonly: 'Read-only workspace',
  readwrite: 'Read/write workspace',
};

export function filesystemLabel(mode: string | null | undefined): string {
  if (!mode) return 'Unknown';
  return FS_LABELS[mode] ?? mode;
}

// The two run commands shown on the detail page (contract: id = owner/repo).
export function runCommands(id: string): { cli: string; mcp: string } {
  return {
    cli: `primordial run github:${id}`,
    mcp: `run_agent("github:${id}", "<your task>")`,
  };
}

// Collect distinct sorted facet values across the catalog.
export function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b),
  );
}
