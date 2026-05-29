// Port of packages/client/.../security/manifest_safety.py:assess_manifest_trust.
//
// Trust = "auto" when every provider declared in manifest.keys is a known
// provider; otherwise "requires_approval". Mirrors the client so the catalog
// `trust` field matches what the client computes locally.
//
// Keep KNOWN_PROVIDERS in sync with
// packages/client/src/primordial/known_providers.py (names only — the trust
// decision depends solely on membership, not domain/auth_style).

import type { ParsedManifest, TrustTier } from '../types';

export const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  // LLM inference
  'anthropic', 'openai', 'google-ai', 'mistral', 'cohere', 'together',
  'groq', 'deepseek', 'perplexity', 'fireworks', 'replicate', 'hugging-face',
  'ai21', 'aleph-alpha', 'xai', 'nvidia-nim', 'cerebras',
  // Search
  'brave', 'serper', 'tavily', 'exa', 'you', 'bing-search',
  // Scraping / browser
  'firecrawl', 'browserless', 'jina', 'apify',
  // Vector / embeddings
  'pinecone', 'voyage',
  // Storage / data
  'supabase', 'neon', 'airtable',
  // Communications
  'sendgrid', 'twilio', 'slack', 'discord',
  // Misc SaaS
  'github', 'linear', 'notion', 'stripe', 'openweather', 'newsapi',
  'alpha-vantage', 'polygon-io', 'e2b',
]);

export function assessTrust(manifest: ParsedManifest): TrustTier {
  const keys = manifest.keys ?? [];
  for (const key of keys) {
    if (!KNOWN_PROVIDERS.has(key.provider)) {
      return 'requires_approval';
    }
  }
  return 'auto';
}
